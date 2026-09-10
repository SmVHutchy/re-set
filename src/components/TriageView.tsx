import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUUpLeft, SkipForward, X } from "@phosphor-icons/react";
import type { Track } from "../lib/nml";
import { PHASES, PHASE_COLOR, PHASE_LABEL, type Phase } from "../lib/tags";
import { activeSet, getTags, useStore } from "../lib/store/StoreProvider";
import { toast } from "../lib/toast";

/**
 * Station „Sichten“ — die Schleife, die pro Gig-Ordner dreihundert Mal läuft:
 * vorhören, Phase drücken oder aussortieren, weiter.
 *
 * Der Entwurf folgt einer gemessenen Zahl: der Gig-Ordner `casa 2.0` enthält
 * 304 Dateien, das fertige Set rund 40. Bei diesem Verhältnis kostet jeder
 * Mausweg dreihundertfach.
 *
 * Die wichtigste Regel steht deshalb über allem: **das Raster bewegt sich
 * nicht.** Eine beurteilte Kachel verschwindet nicht und rückt nichts nach,
 * sie bekommt nur ihre Phasenfarbe. Ein Klick sortiert nicht um, er wählt aus.
 * Wer auf ein Cover zielt, trifft es auch beim zehnten Mal noch — vorher
 * rutschte die Reihe unter dem Zeiger weg, und man musste den gesuchten Track
 * nach jedem Urteil neu suchen.
 */

const SPALTEN = 3;
const TARGET_KEY = "reset.triage.target";
const FOLDER_KEY = "reset.triage.folder";
const COMPACT_KEY = "reset.triage.nurOffene";

function fmtDur(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")} h` : `${m} min`;
}

type Urteil = Phase | "raus" | null;

export function TriageView({
  tracks,
  onPreview,
  previewId,
  onTogglePlay,
  startAt,
  onStartAt,
}: {
  tracks: Track[];
  onPreview: (id: string) => void;
  previewId: string | null;
  onTogglePlay: () => void;
  startAt: number;
  onStartAt: (v: number) => void;
}) {
  const { state, dispatch } = useStore();
  const set = activeSet(state);

  // Ordner der Sammlung mit ihren Trackzahlen — der Ordner ist die
  // Arbeitseinheit, nicht die Gesamtbibliothek.
  const folders = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tracks) {
      const f = t.folder ?? "ohne Ordner";
      m.set(f, (m.get(f) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [tracks]);

  const [folder, setFolder] = useState<string | null>(
    () => localStorage.getItem(FOLDER_KEY) ?? null,
  );
  const [targetMin, setTargetMin] = useState<number>(() =>
    Number(localStorage.getItem(TARGET_KEY) ?? 180),
  );
  const [nurOffene, setNurOffene] = useState<boolean>(
    () => localStorage.getItem(COMPACT_KEY) === "1",
  );
  const [autoplay, setAutoplay] = useState(true);
  const [cursorId, setCursorId] = useState<string | null>(null);

  useEffect(() => {
    if (folder) localStorage.setItem(FOLDER_KEY, folder);
  }, [folder]);
  useEffect(() => {
    localStorage.setItem(TARGET_KEY, String(targetMin));
  }, [targetMin]);
  useEffect(() => {
    localStorage.setItem(COMPACT_KEY, nurOffene ? "1" : "0");
  }, [nurOffene]);

  const active = folder ?? folders[0]?.[0] ?? null;

  // Feste Reihenfolge — die Grundlage dafür, dass nichts springt.
  const inFolder = useMemo(
    () => tracks.filter((t) => (t.folder ?? "ohne Ordner") === active),
    [tracks, active],
  );

  const setIds = useMemo(() => new Set(set.trackIds), [set.trackIds]);

  const urteilVon = useCallback(
    (t: Track): Urteil => {
      if (state.dismissed[t.id]) return "raus";
      if (setIds.has(t.id)) return getTags(state, t.id).phase ?? null;
      return null;
    },
    [state, setIds],
  );

  const offen = useCallback(
    (t: Track) => !state.dismissed[t.id] && !setIds.has(t.id),
    [state.dismissed, setIds],
  );

  const sichtbar = useMemo(
    () => (nurOffene ? inFolder.filter(offen) : inFolder),
    [inFolder, nurOffene, offen],
  );

  const erledigt = inFolder.length - inFolder.filter(offen).length;

  // Der Cursor zeigt auf eine Kachel, nicht auf einen Listenplatz: verschwindet
  // sie (Ordnerwechsel, Kompaktmodus), fällt er auf den ersten offenen zurück.
  const cursorIndex = useMemo(() => {
    const i = sichtbar.findIndex((t) => t.id === cursorId);
    if (i >= 0) return i;
    const ersterOffen = sichtbar.findIndex(offen);
    return ersterOffen >= 0 ? ersterOffen : 0;
  }, [sichtbar, cursorId, offen]);

  const shown = sichtbar[cursorIndex] ?? null;

  const setTracks = useMemo(() => {
    const byId = new Map(tracks.map((t) => [t.id, t]));
    return set.trackIds.map((id) => byId.get(id)).filter((t): t is Track => !!t);
  }, [tracks, set.trackIds]);

  const setSeconds = setTracks.reduce((s, t) => s + (t.durationS ?? 0), 0);
  const targetSeconds = targetMin * 60;

  const byPhase = useMemo(() => {
    const m: Record<Phase | "offen", Track[]> = { pre: [], mid: [], peak: [], late: [], offen: [] };
    for (const t of setTracks) m[getTags(state, t.id).phase ?? "offen"].push(t);
    return m;
  }, [setTracks, state]);

  // --- Bewegung -------------------------------------------------------------
  /** Nach einem Urteil zum nächsten *offenen* Track — nicht stur eins weiter. */
  const weiterZuOffen = useCallback(
    (abIndex: number) => {
      for (let i = abIndex; i < sichtbar.length; i++) {
        if (offen(sichtbar[i])) return setCursorId(sichtbar[i].id);
      }
      // Nichts mehr dahinter: von vorn suchen, sonst stehen bleiben.
      for (let i = 0; i < abIndex; i++) {
        if (offen(sichtbar[i])) return setCursorId(sichtbar[i].id);
      }
      setCursorId(sichtbar[Math.min(abIndex, sichtbar.length - 1)]?.id ?? null);
    },
    [sichtbar, offen],
  );

  const bewege = useCallback(
    (delta: number) => {
      const ziel = Math.max(0, Math.min(sichtbar.length - 1, cursorIndex + delta));
      setCursorId(sichtbar[ziel]?.id ?? null);
    },
    [sichtbar, cursorIndex],
  );

  // --- Urteile --------------------------------------------------------------
  const judge = useCallback(
    (phase: Phase) => {
      const t = shownRef.current;
      if (!t) return;
      dispatch({ type: "addToSet", trackId: t.id });
      dispatch({ type: "setPhase", id: t.id, phase });
      toast(`${PHASE_LABEL[phase]} · ${t.title}`);
      weiterRef.current(cursorRef.current + 1);
    },
    [dispatch],
  );

  const drop = useCallback(() => {
    const t = shownRef.current;
    if (!t) return;
    dispatch({ type: "dismiss", id: t.id });
    weiterRef.current(cursorRef.current + 1);
  }, [dispatch]);

  const skip = useCallback(() => bewegeRef.current(1), []);

  // --- Vorhören -------------------------------------------------------------
  // Automatisch, nicht auf Zuruf: wer 304 Tracks beurteilt, soll den nächsten
  // hören, sobald er da ist. Sonst bleibt der Player auf dem alten Track und
  // man urteilt über das, was gerade läuft.
  useEffect(() => {
    if (autoplay && shown && shown.audioPath && previewId !== shown.id) onPreview(shown.id);
  }, [autoplay, shown, previewId, onPreview]);

  const preview = useCallback(() => {
    if (!shown) return;
    if (previewId === shown.id) onTogglePlay();
    else onPreview(shown.id);
  }, [shown, previewId, onPreview, onTogglePlay]);

  // --- Tastatur -------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Gedrückt gehaltene Taste ignorieren: die Tastaturwiederholung würde
      // sonst mehrere Tracks beurteilen, ohne dass man sie gehört hat.
      if (e.repeat) return;

      if (e.key === " ") {
        e.preventDefault();
        previewRef.current();
      } else if (e.key >= "1" && e.key <= "4") {
        e.preventDefault();
        judgeRef.current(PHASES[Number(e.key) - 1]);
      } else if (e.key === "x" || e.key === "X" || e.key === "Backspace") {
        e.preventDefault();
        dropRef.current();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        bewegeRef.current(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        bewegeRef.current(-1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        bewegeRef.current(SPALTEN);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        bewegeRef.current(-SPALTEN);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Refs, damit der Tastatur-Listener genau einmal gebunden wird.
  const shownRef = useRefLatest(shown);
  const cursorRef = useRefLatest(cursorIndex);
  const judgeRef = useRefLatest(judge);
  const dropRef = useRefLatest(drop);
  const bewegeRef = useRefLatest(bewege);
  const weiterRef = useRefLatest(weiterZuOffen);
  const previewRef = useRefLatest(preview);

  // Cursor immer im Blick behalten — bei 304 Kacheln sonst schnell außerhalb.
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    gridRef.current
      ?.querySelector<HTMLElement>('[data-cursor="1"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [cursorIndex, sichtbar.length]);

  // --- Darstellung ----------------------------------------------------------
  if (!folders.length) {
    return (
      <div className="view-fade mt-7 rounded-lg border border-line bg-surface p-6">
        <h2 className="mb-1 text-sm font-medium text-ink">Nichts zu sichten</h2>
        <p className="text-xs text-ink-soft">
          Lade zuerst einen Ordner unter <span className="text-ink">Laden</span> oder importiere
          eine bestehende Sammlung.
        </p>
      </div>
    );
  }

  const randFarbe = (u: Urteil) =>
    u === "raus" ? "var(--color-line-strong)" : u ? PHASE_COLOR[u] : "transparent";

  return (
    <div className="view-fade mt-7 grid gap-4 lg:grid-cols-[260px_1fr_260px]">
      {/* Warteschlange — feste Reihenfolge, nichts springt */}
      <section className="rounded-lg border border-line bg-surface p-4">
        <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-ink-faint">
          Ordner
        </label>
        <select
          value={active ?? ""}
          onChange={(e) => {
            setFolder(e.target.value);
            setCursorId(null);
          }}
          className="mb-3 h-8 w-full rounded-md border border-line bg-base px-2 text-[12px] text-ink-soft"
        >
          {folders.map(([f, n]) => (
            <option key={f} value={f}>
              {f} · {n}
            </option>
          ))}
        </select>

        <div className="mb-1 flex items-baseline justify-between font-mono text-[11px]">
          <span className="text-ink">
            {erledigt} / {inFolder.length}
          </span>
          <span className="text-ink-faint">gesichtet</span>
        </div>
        <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-raise">
          <div
            className="h-full bg-accent transition-[width] duration-300"
            style={{ width: `${inFolder.length ? (erledigt / inFolder.length) * 100 : 0}%` }}
          />
        </div>

        <label className="mb-2 flex cursor-pointer items-center gap-1.5 text-[10px] text-ink-soft">
          <input
            type="checkbox"
            checked={nurOffene}
            onChange={(e) => setNurOffene(e.target.checked)}
            className="h-3 w-3 rounded border border-line"
          />
          nur offene zeigen
          <span className="text-ink-faint">(Raster rückt dann nach)</span>
        </label>

        <div ref={gridRef} className="grid max-h-[440px] grid-cols-3 gap-1.5 overflow-y-auto p-0.5">
          {sichtbar.map((t, i) => {
            const u = urteilVon(t);
            const amCursor = i === cursorIndex;
            return (
              <button
                key={t.id}
                data-cursor={amCursor ? "1" : undefined}
                onClick={() => setCursorId(t.id)}
                title={`${t.artist} – ${t.title}`}
                className="relative aspect-square overflow-hidden rounded-sm transition-transform"
                style={{
                  outline: amCursor ? "2px solid var(--color-accent)" : `1.5px solid ${randFarbe(u)}`,
                  outlineOffset: amCursor ? "1px" : "-1.5px",
                  // Beurteilte Kacheln bleiben liegen, treten aber zurück —
                  // so sieht man den Fortschritt an Ort und Stelle.
                  opacity: u === "raus" ? 0.25 : u ? 0.55 : 1,
                }}
              >
                {t.coverPath ? (
                  <img
                    src={t.coverPath}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-raise text-[8px] text-ink-faint">
                    {t.title.slice(0, 2)}
                  </span>
                )}
                {u && u !== "raus" && (
                  <span
                    className="absolute bottom-0 left-0 right-0 py-[1px] text-center font-mono text-[7px] leading-none"
                    style={{ background: PHASE_COLOR[u], color: "var(--color-base)" }}
                  >
                    {PHASE_LABEL[u]}
                  </span>
                )}
                {u === "raus" && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <X size={14} weight="bold" color="var(--color-ink-faint)" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Bühne */}
      <section className="flex flex-col items-center justify-center gap-4 rounded-lg border border-line bg-base p-6">
        {shown ? (
          <>
            {shown.coverPath ? (
              <img src={shown.coverPath} alt="" className="h-40 w-40 rounded-md object-cover" />
            ) : (
              <div className="flex h-40 w-40 items-center justify-center rounded-md bg-raise font-mono text-[11px] text-ink-faint">
                kein Cover
              </div>
            )}

            <div className="text-center">
              <div className="text-[15px] text-ink">{shown.title}</div>
              <div className="text-[12px] text-ink-soft">{shown.artist}</div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 font-mono text-[11px] text-ink-faint">
              {shown.keyCamelot && <span className="text-accent">{shown.keyCamelot}</span>}
              {shown.bpm != null && <span>{shown.bpm.toFixed(1)} BPM</span>}
              {(shown.keyEstimated || shown.bpmEstimated) && <span>geschätzt</span>}
              {shown.genre && <span>· {shown.genre}</span>}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {PHASES.map((p, i) => {
                const aktiv = urteilVon(shown) === p;
                return (
                  <button
                    key={p}
                    onClick={() => judge(p)}
                    className="flex h-9 items-center gap-1.5 rounded-md border px-3 text-[12px] transition-colors"
                    style={{
                      borderColor: PHASE_COLOR[p],
                      color: aktiv ? "var(--color-base)" : PHASE_COLOR[p],
                      background: aktiv ? PHASE_COLOR[p] : "transparent",
                    }}
                  >
                    <span className="font-mono text-[10px] opacity-70">{i + 1}</span>
                    {PHASE_LABEL[p]}
                  </button>
                );
              })}
              <button
                onClick={drop}
                className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[12px] text-ink-soft transition-colors hover:text-ink"
              >
                <X size={13} weight="regular" /> raus
              </button>
              <button
                onClick={skip}
                className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[12px] text-ink-soft transition-colors hover:text-ink"
              >
                <SkipForward size={13} weight="regular" /> weiter
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 border-t border-line pt-3 text-[11px] text-ink-soft">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={autoplay}
                  onChange={(e) => setAutoplay(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border border-line"
                />
                automatisch vorhören
              </label>
              <span className="flex items-center gap-1">
                Einstieg
                {[
                  { v: 0, l: "Anfang" },
                  { v: 0.35, l: "35 %" },
                  { v: 0.5, l: "Mitte" },
                ].map((o) => (
                  <button
                    key={o.v}
                    onClick={() => onStartAt(o.v)}
                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                      startAt === o.v
                        ? "border-accent text-accent"
                        : "border-line text-ink-faint hover:text-ink"
                    }`}
                  >
                    {o.l}
                  </button>
                ))}
              </span>
            </div>

            <p className="text-center font-mono text-[10px] leading-relaxed text-ink-soft">
              Leertaste hören · 1–4 Phase · X raus · Pfeile bewegen · ⌘Z zurück
            </p>
          </>
        ) : (
          <div className="text-center">
            <div className="mb-1 text-[15px] text-ink">Ordner durch</div>
            <p className="max-w-xs text-[12px] text-ink-soft">
              {inFolder.length} Tracks gesichtet, {setTracks.length} im Set. Weiter unter{" "}
              <span className="text-ink">Bauen</span>.
            </p>
          </div>
        )}
      </section>

      {/* Phasen-Behälter */}
      <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <span className="truncate text-[12px] text-ink">{set.name}</span>
          <span className="font-mono text-[10px] text-ink-faint">{setTracks.length}</span>
        </div>

        <div className="flex flex-col gap-2">
          {PHASES.map((p) => (
            <div
              key={p}
              className="rounded-md border border-dashed p-2"
              style={{ borderColor: PHASE_COLOR[p] }}
            >
              <div className="mb-1 flex items-baseline justify-between font-mono text-[10px]">
                <span style={{ color: PHASE_COLOR[p] }}>{PHASE_LABEL[p]}</span>
                <span className="text-ink-faint">{byPhase[p].length}</span>
              </div>
              {byPhase[p].slice(0, 3).map((t) => (
                <div key={t.id} className="truncate text-[10px] text-ink-faint">
                  {t.title}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="border-t border-line pt-2">
          <div className="mb-1 flex items-baseline justify-between font-mono text-[11px]">
            <span className="text-ink">{fmtDur(setSeconds)}</span>
            <span className="text-ink-faint">von {fmtDur(targetSeconds)}</span>
          </div>
          <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-raise">
            <div
              className="h-full bg-sig transition-[width] duration-300"
              style={{ width: `${Math.min(100, (setSeconds / targetSeconds) * 100)}%` }}
            />
          </div>
          <div className="font-mono text-[10px] text-ink-soft">
            {setSeconds >= targetSeconds
              ? `${fmtDur(setSeconds - targetSeconds)} darüber`
              : `es fehlen ${fmtDur(targetSeconds - setSeconds)}`}
          </div>
          <label className="mt-2 flex items-center gap-2 text-[10px] text-ink-faint">
            Ziel
            <input
              type="number"
              min={30}
              max={480}
              step={15}
              value={targetMin}
              onChange={(e) => setTargetMin(Number(e.target.value) || 180)}
              className="h-6 w-16 rounded border border-line bg-base px-1.5 text-[11px] text-ink-soft"
            />
            min
          </label>
        </div>

        <button
          onClick={() => dispatch({ type: "undo" })}
          className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-line text-[11px] text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowUUpLeft size={13} weight="regular" /> letzte Entscheidung zurück
        </button>
      </section>
    </div>
  );
}

/** Hält den jeweils neuesten Wert, ohne Effekte neu zu binden. */
function useRefLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
