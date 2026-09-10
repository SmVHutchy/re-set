import { useMemo, useRef, useState } from "react";
import { ArrowsClockwise, DownloadSimple, FolderPlus, Warning } from "@phosphor-icons/react";
import { streamNdjson } from "../lib/ndjson";
import type { Track } from "../lib/nml";
import { PHASES, PHASE_COLOR, PHASE_LABEL, type Phase } from "../lib/tags";
import { activeSet, getTags, useStore } from "../lib/store/StoreProvider";
import { nmlPlaylists, nmlSinglePlaylist, m3u, type ExportOptions } from "../lib/export";
import { toast } from "../lib/toast";

/**
 * Station „Übergeben“ — beantwortet die Frage, um die es beim ganzen Ablauf
 * geht: kann ich das jetzt spielen, ohne dass Traktor erst rechnet?
 *
 * Grundlage ist ein gemessener Befund: in der Collection ist „analysiert“ ein
 * Bündel, das immer geschlossen auftritt (TEMPO + MUSICAL_KEY + Grid + FLAGS),
 * und 4113 von 4701 Tracks haben davon nichts. Deshalb reichen zwei Zustände
 * nicht — ein Track ist bestätigt, geschätzt, oder Traktor muss ran.
 */

type Readiness = "bestaetigt" | "geschaetzt" | "offen";

const READY_LABEL: Record<Readiness, string> = {
  bestaetigt: "bestätigt",
  geschaetzt: "geschätzt",
  offen: "Traktor rechnet nach",
};

const READY_COLOR: Record<Readiness, string> = {
  bestaetigt: "var(--color-sig)",
  geschaetzt: "var(--color-phase-late)",
  offen: "var(--color-line-strong)",
};

/**
 * Ein Track gilt als bestätigt, wenn BPM und Tonart vorliegen und *nicht*
 * aus unserer eigenen Schätzung stammen. Die Unterscheidung ist keine
 * Feinheit: ein geschätztes BPM trifft in der Messung nur zu 55 % exakt, und
 * ein daraus gebautes Beatgrid wäre schlimmer als gar keins — Traktor rechnet
 * es nicht nach, und der Versatz fällt erst beim Auflegen auf.
 */
function readiness(t: Track): Readiness {
  if (t.bpm == null || !t.keyCamelot) return "offen";
  if (t.bpmEstimated || t.keyEstimated) return "geschaetzt";
  return "bestaetigt";
}

function download(content: string, name: string, mime = "audio/x-mpegurl") {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

interface PlanOp {
  von: string;
  nach: string;
  phase: string;
  groesse: number;
  existiert: boolean;
}

interface Plan {
  wurzel: string;
  ops: PlanOp[];
  probleme: Array<{ grund: string; titel: string }>;
  zusammenfassung: { gesamt: number; neu: number; vorhanden: number; bytes: number; ordner: string[] };
}

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(0)} MB`;

interface TraktorStatus {
  gefunden: boolean;
  datei?: string;
  traktorLaeuft?: boolean;
  schreibbar?: boolean;
  geaendert?: string | null;
  hinweis?: string | null;
}

interface DryRun {
  datei: string;
  traktorLaeuft: boolean;
  neu: number;
  schonVorhanden: number;
  playlists: number;
  mitGrid: number;
  kollisionen: string[];
  waechstUm: number;
}

export function HandoffView({ tracks }: { tracks: Track[] }) {
  const { state } = useStore();
  const set = activeSet(state);
  const [ziel, setZiel] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  // Grid mitschreiben spart Traktors Analysezeit; Sperren garantiert, dass es
  // dabei bleibt — kostet aber die Möglichkeit, in Traktor einfach neu zu
  // analysieren. Deshalb getrennt und beides sichtbar.
  const [opt, setOpt] = useState<ExportOptions>({ grid: true, sperren: false });
  const [status, setStatus] = useState<TraktorStatus | null>(null);
  const [dry, setDry] = useState<DryRun | null>(null);
  const [syncLaeuft, setSyncLaeuft] = useState(false);

  const items = useMemo(() => {
    const byId = new Map(tracks.map((t) => [t.id, t]));
    return set.trackIds.map((id) => byId.get(id)).filter((t): t is Track => !!t);
  }, [tracks, set.trackIds]);

  const counts = useMemo<Record<Readiness, number>>(() => {
    const c: Record<Readiness, number> = { bestaetigt: 0, geschaetzt: 0, offen: 0 };
    for (const t of items) c[readiness(t)]++;
    return c;
  }, [items]);

  const safeName = (s: string) => (s || "set").replace(/[^\w\-]+/g, "_");

  /** Set nach Phasen gebündelt, in Set-Reihenfolge, leere Phasen weggelassen. */
  const gruppen = useMemo(() => {
    const out: Array<{ label: string; tracks: unknown[] }> = [];
    const alsNutzlast = (t: Track) => ({
      title: t.title,
      artist: t.artist,
      genre: t.genre,
      comment: null,
      durationS: t.durationS,
      bpm: t.bpm,
      keyValue: t.keyValue,
      bpmEstimated: t.bpmEstimated,
      // Der Raster-Anker kommt aus dem Grid-Cue, den unsere Analyse
      // geschrieben hat — oder aus Traktors eigenem, falls der Track dort
      // schon analysiert ist.
      gridMs: t.cues.find((c) => c.kind === "grid")?.startMs ?? null,
      loc: t.loc,
    });
    for (const p of PHASES as Phase[]) {
      const inPhase = items.filter((t) => getTags(state, t.id).phase === p && t.loc);
      if (inPhase.length) out.push({ label: PHASE_LABEL[p], tracks: inPhase.map(alsNutzlast) });
    }
    const ohne = items.filter((t) => getTags(state, t.id).phase == null && t.loc);
    if (ohne.length) out.push({ label: "ohne Phase", tracks: ohne.map(alsNutzlast) });
    return out;
  }, [items, state]);

  const statusHolen = async () => {
    try {
      const r = await fetch("/api/traktor/status");
      setStatus(await r.json());
    } catch {
      toast("Server nicht erreichbar");
    }
  };

  const syncVorschau = async () => {
    setDry(null);
    try {
      const r = await fetch("/api/traktor/dry-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setName: set.name, gruppen, opt }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast(d.error ?? "Vorschau fehlgeschlagen");
        return;
      }
      setDry(d);
      setStatus((st) => (st ? { ...st, traktorLaeuft: d.traktorLaeuft } : st));
    } catch {
      toast("Netzwerkfehler");
    }
  };

  const syncSchreiben = async () => {
    if (!dry) return;
    setSyncLaeuft(true);
    try {
      const r = await fetch("/api/traktor/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setName: set.name, gruppen, opt, confirm: true }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast(d.error ?? "Schreiben fehlgeschlagen");
        return;
      }
      toast(`${d.playlists} Playlists geschrieben · ${d.neu} neue Tracks`);
      setDry(null);
      statusHolen();
    } catch {
      toast("Netzwerkfehler");
    } finally {
      setSyncLaeuft(false);
    }
  };

  // Vorschau holen: der Server rechnet, was passieren wuerde, und fasst nichts
  // an. Nur was hier steht, darf danach geschrieben werden.
  const vorschau = async () => {
    setLog([]);
    try {
      const res = await fetch("/api/handoff/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setName: set.name,
          targetRoot: ziel.trim() || undefined,
          items: items.map((t) => ({
            path: t.path,
            title: t.title,
            phase: getTags(state, t.id).phase,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Vorschau fehlgeschlagen");
        return;
      }
      setPlan(data);
      setZiel(data.wurzel);
    } catch {
      toast("Netzwerkfehler");
    }
  };

  const schreiben = async () => {
    if (!plan) return;
    setLaeuft(true);
    setLog([]);
    try {
      const r = await streamNdjson(
        "/api/handoff/apply",
        { wurzel: plan.wurzel, ops: plan.ops, confirm: true },
        (evt) => {
          if (evt.type === "log") {
            setLog((prev) => [...prev, String(evt.msg)]);
            requestAnimationFrame(() =>
              logRef.current?.scrollTo({ top: logRef.current.scrollHeight }),
            );
          }
        },
      );
      if (r.error) toast(r.error);
      else if (r.ok) {
        toast(`${r.done?.kopiert} Dateien kopiert`);
        setPlan(null);
      } else toast(`${r.done?.fehler} Fehler - Log ansehen`);
    } catch {
      toast("Netzwerkfehler");
    } finally {
      setLaeuft(false);
    }
  };

  if (!items.length) {
    return (
      <div className="view-fade mt-7 rounded-lg border border-line bg-surface p-6">
        <h2 className="mb-1 text-sm font-medium text-ink">Set ist leer</h2>
        <p className="text-xs text-ink-soft">
          Sichte zuerst einen Ordner unter <span className="text-ink">Sichten</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="view-fade mt-7 grid gap-4 lg:grid-cols-[1fr_300px]">
      <section className="rounded-lg border border-accent bg-surface p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-ink">Bereit für Traktor</h2>
          <span className="font-mono text-[11px] text-accent">
            {counts.bestaetigt} von {items.length}
          </span>
        </div>

        <div className="mb-4 flex h-1.5 overflow-hidden rounded-full bg-raise">
          {(["bestaetigt", "geschaetzt", "offen"] as Readiness[]).map((r) =>
            counts[r] ? (
              <div
                key={r}
                style={{
                  width: `${(counts[r] / items.length) * 100}%`,
                  background: READY_COLOR[r],
                }}
              />
            ) : null,
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px]">
          {(["bestaetigt", "geschaetzt", "offen"] as Readiness[]).map((r) => (
            <span key={r} className="flex items-center gap-1.5 text-ink-soft">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: READY_COLOR[r] }}
              />
              {READY_LABEL[r]} {counts[r]}
            </span>
          ))}
        </div>

        <div className="max-h-[440px] overflow-y-auto">
          {items.map((t) => {
            const r = readiness(t);
            const phase = getTags(state, t.id).phase;
            return (
              <div
                key={t.id}
                className="flex items-center gap-2.5 border-t border-line py-1.5 first:border-t-0"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: READY_COLOR[r] }}
                />
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-soft">
                  {t.artist} – {t.title}
                </span>
                {phase && (
                  <span className="font-mono text-[10px]" style={{ color: PHASE_COLOR[phase] }}>
                    {PHASE_LABEL[phase]}
                  </span>
                )}
                <span className="w-28 shrink-0 text-right font-mono text-[10px] text-ink-faint">
                  {r === "offen"
                    ? "—"
                    : `${t.bpm?.toFixed(1)} · ${t.keyCamelot}`}
                </span>
                <span className="w-32 shrink-0 text-right font-mono text-[10px] text-ink-faint">
                  {READY_LABEL[r]}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
        <h3 className="text-[12px] font-medium text-ink">Übergabe</h3>

        <div className="flex flex-col gap-1.5 rounded-md border border-line bg-base p-2.5">
          <label className="flex cursor-pointer items-start gap-2 text-[11px] text-ink-soft">
            <input
              type="checkbox"
              checked={opt.grid}
              onChange={(e) => setOpt((o) => ({ ...o, grid: e.target.checked }))}
              className="mt-0.5 h-3.5 w-3.5 rounded border border-line"
            />
            <span>
              Beatgrid mitschreiben
              <span className="ml-1 font-mono text-ink-faint">
                ({counts.bestaetigt} von {items.length})
              </span>
              <br />
              <span className="text-ink-faint">
                Nur bestätigte Werte. Traktor rechnet diese Tracks nicht neu.
              </span>
            </span>
          </label>
          <label
            className={`flex items-start gap-2 text-[11px] ${
              opt.grid ? "cursor-pointer text-ink-soft" : "cursor-not-allowed text-ink-faint"
            }`}
          >
            <input
              type="checkbox"
              checked={opt.sperren}
              disabled={!opt.grid}
              onChange={(e) => setOpt((o) => ({ ...o, sperren: e.target.checked }))}
              className="mt-0.5 h-3.5 w-3.5 rounded border border-line"
            />
            <span>
              Analyse sperren
              <br />
              <span className="text-ink-faint">
                Sicher gegen Nachrechnen — dafür lässt sich der Track in Traktor erst nach
                Rechtsklick → Analyse entsperren neu analysieren.
              </span>
            </span>
          </label>
        </div>

        <button
          onClick={() => {
            const { content, playlists, mitGrid } = nmlPlaylists(items, state, set.name, opt);
            download(content, `${safeName(set.name)}.nml`, "application/xml");
            toast(`${playlists} Phasen-Playlists · ${mitGrid} mit Grid`);
          }}
          className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-medium text-on-accent"
        >
          <DownloadSimple size={14} weight="regular" /> NML — Ordner je Phase
        </button>

        <button
          onClick={() => {
            const { content, tracks: n, mitGrid } = nmlSinglePlaylist(items, state, set.name, opt);
            download(content, `${safeName(set.name)} – eine Liste.nml`, "application/xml");
            toast(`${n} Tracks · ${mitGrid} mit Grid`);
          }}
          className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[12px] text-ink-soft transition-colors hover:text-ink"
        >
          <DownloadSimple size={14} weight="regular" /> NML — eine Playlist
        </button>

        <button
          onClick={() => {
            download(m3u(items, state), `${safeName(set.name)}.m3u`);
            toast(".m3u exportiert");
          }}
          className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[12px] text-ink-soft transition-colors hover:text-ink"
        >
          <DownloadSimple size={14} weight="regular" /> .m3u
        </button>

        <p className="text-[11px] leading-relaxed text-ink-soft">
          In Traktor über Rechtsklick → <span className="text-ink">Playlist-Ordner importieren</span>{" "}
          laden. Der einfache Playlist-Import nimmt nur eine Liste aus der Datei.
        </p>

        <div className="mt-1 border-t border-line pt-3">
          <h3 className="mb-1.5 text-[12px] font-medium text-ink">Direkt in Traktor</h3>
          <p className="mb-2 text-[11px] leading-relaxed text-ink-soft">
            Schreibt die Phasen als Playlists in deine <code className="text-ink">collection.nml</code>
            {" "}— ohne Import-Umweg. Vorhandene Tracks werden nicht angefasst, ihre Cues und
            Beatgrids bleiben.
          </p>

          {!status && (
            <button
              onClick={statusHolen}
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-line text-[12px] text-ink-soft transition-colors hover:text-ink"
            >
              <ArrowsClockwise size={13} weight="regular" /> Collection suchen
            </button>
          )}

          {status && !status.gefunden && (
            <p className="text-[11px] text-ink-soft">Keine collection.nml gefunden.</p>
          )}

          {status?.gefunden && (
            <div className="rounded-md border border-line bg-base p-2.5 font-mono text-[10px] leading-relaxed text-ink-soft">
              <div className="truncate text-ink">{status.datei}</div>
              {status.traktorLaeuft ? (
                <div className="mt-1" style={{ color: "var(--color-phase-peak)" }}>
                  Traktor läuft — bitte beenden. Sonst überschreibt es das Geschriebene beim
                  Schließen.
                </div>
              ) : (
                <div className="mt-1">bereit zum Schreiben</div>
              )}
            </div>
          )}

          {status?.gefunden && (
            <button
              onClick={syncVorschau}
              disabled={syncLaeuft}
              className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-line text-[12px] text-ink-soft transition-colors hover:text-ink disabled:opacity-50"
            >
              <ArrowsClockwise size={13} weight="regular" /> Vorschau
            </button>
          )}

          {dry && (
            <div className="mt-2 rounded-md border border-line bg-base p-2.5">
              <div className="font-mono text-[10px] leading-relaxed text-ink-soft">
                <div>
                  {dry.playlists} Playlists · {dry.neu} neue Tracks · {dry.schonVorhanden} schon in
                  der Collection
                </div>
                <div>{dry.mitGrid} davon mit Beatgrid · Datei wächst um {mb(dry.waechstUm)}</div>
                {dry.kollisionen.length > 0 && (
                  <div className="mt-1" style={{ color: "var(--color-phase-late)" }}>
                    Namen existieren schon: {dry.kollisionen.join(" · ")}
                  </div>
                )}
              </div>
              <button
                onClick={syncSchreiben}
                disabled={syncLaeuft || dry.traktorLaeuft}
                className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-accent text-[12px] font-medium text-on-accent disabled:opacity-50"
              >
                {dry.traktorLaeuft
                  ? "Erst Traktor beenden"
                  : syncLaeuft
                    ? "Schreibt …"
                    : "In Collection schreiben"}
              </button>
              <p className="mt-1.5 text-[10px] leading-relaxed text-ink-faint">
                Eine Sicherung mit Zeitstempel wird vorher angelegt.
              </p>
            </div>
          )}
        </div>

        <div className="mt-1 border-t border-line pt-3">
          <h3 className="mb-1.5 text-[12px] font-medium text-ink">Ordner schreiben</h3>
          <p className="mb-2 text-[11px] leading-relaxed text-ink-soft">
            Legt <code className="text-ink">pre</code> · <code className="text-ink">mid</code> ·{" "}
            <code className="text-ink">peak</code> · <code className="text-ink">late</code> an und
            kopiert die Tracks hinein. Es wird kopiert, nichts verschoben und nichts überschrieben.
          </p>
          <input
            value={ziel}
            onChange={(e) => {
              setZiel(e.target.value);
              setPlan(null);
            }}
            placeholder="Zielordner (leer = Download-Ordner / Set-Name)"
            className="mb-2 h-8 w-full rounded-md border border-line bg-base px-2 font-mono text-[11px] text-ink placeholder:text-ink-faint"
          />
          <button
            onClick={vorschau}
            disabled={laeuft}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-line text-[12px] text-ink-soft transition-colors hover:text-ink disabled:opacity-50"
          >
            <FolderPlus size={13} weight="regular" /> Vorschau
          </button>

          {plan && (
            <div className="mt-2 rounded-md border border-line bg-base p-2.5">
              <div className="font-mono text-[10px] leading-relaxed text-ink-soft">
                <div className="truncate text-ink">{plan.wurzel}</div>
                <div>
                  {plan.zusammenfassung.neu} neu · {plan.zusammenfassung.vorhanden} liegen schon da ·{" "}
                  {mb(plan.zusammenfassung.bytes)}
                </div>
                <div>Ordner: {plan.zusammenfassung.ordner.join(" · ")}</div>
                {plan.probleme.length > 0 && (
                  <div className="mt-1" style={{ color: "var(--color-phase-peak)" }}>
                    {plan.probleme.length} übersprungen: {plan.probleme[0].grund}
                  </div>
                )}
              </div>
              <button
                onClick={schreiben}
                disabled={laeuft || plan.zusammenfassung.neu === 0}
                className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-accent text-[12px] font-medium text-on-accent disabled:opacity-50"
              >
                {laeuft
                  ? "Kopiert …"
                  : plan.zusammenfassung.neu === 0
                    ? "Nichts zu tun"
                    : `${plan.zusammenfassung.neu} Dateien schreiben`}
              </button>
            </div>
          )}

          {log.length > 0 && (
            <div
              ref={logRef}
              className="mt-2 max-h-40 overflow-y-auto rounded-md border border-line bg-base p-2 font-mono text-[10px] leading-relaxed text-ink-faint"
            >
              {log.map((l, i) => (
                <div key={i} className="truncate">
                  {l}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-1 border-t border-line pt-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-ink-soft">
            <Warning size={13} weight="regular" /> Was das Grid nicht kann
          </div>
          <p className="text-[11px] leading-relaxed text-ink-soft">
            Geschätzte Werte bekommen kein Grid — {counts.geschaetzt + counts.offen} Tracks bleiben
            damit Traktors Aufgabe. Und auch bei den bestätigten ist die belastbare Untergrenze
            92 %: unter zwölf Tracks kann einer ein Raster bekommen, das wegläuft. Beim ersten Set
            lohnt ein kurzer Blick auf die Wellenform.
          </p>
        </div>
      </section>
    </div>
  );
}
