import { useMemo } from "react";
import { DownloadSimple, Warning } from "@phosphor-icons/react";
import type { Track } from "../lib/nml";
import { PHASE_COLOR, PHASE_LABEL } from "../lib/tags";
import { activeSet, getTags, useStore } from "../lib/store/StoreProvider";
import { nmlPlaylists, nmlSinglePlaylist, m3u } from "../lib/export";
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

export function HandoffView({ tracks }: { tracks: Track[] }) {
  const { state } = useStore();
  const set = activeSet(state);

  const items = useMemo(() => {
    const byId = new Map(tracks.map((t) => [t.id, t]));
    return set.trackIds.map((id) => byId.get(id)).filter((t): t is Track => !!t);
  }, [tracks, set.trackIds]);

  const counts = useMemo(() => {
    const c: Record<Readiness, number> = { bestaetigt: 0, geschaetzt: 0, offen: 0 };
    for (const t of items) c[readiness(t)]++;
    return c;
  }, [items]);

  const safeName = (s: string) => (s || "set").replace(/[^\w\-]+/g, "_");

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

        <button
          onClick={() => {
            const { content, playlists } = nmlPlaylists(items, state, set.name);
            download(content, `${safeName(set.name)}.nml`, "application/xml");
            toast(`${playlists} Phasen-Playlists als .nml`);
          }}
          className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-medium text-on-accent"
        >
          <DownloadSimple size={14} weight="regular" /> NML — Ordner je Phase
        </button>

        <button
          onClick={() => {
            const { content, tracks: n } = nmlSinglePlaylist(items, state, set.name);
            download(content, `${safeName(set.name)} – eine Liste.nml`, "application/xml");
            toast(`${n} Tracks als eine Playlist`);
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
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-ink-soft">
            <Warning size={13} weight="regular" /> Noch nicht gebaut
          </div>
          <p className="text-[11px] leading-relaxed text-ink-soft">
            Ordner <code className="text-ink">pre</code> · <code className="text-ink">mid</code> ·{" "}
            <code className="text-ink">peak</code> · <code className="text-ink">late</code> auf der
            Platte anlegen und das Beatgrid für die {counts.bestaetigt} bestätigten Tracks
            mitschreiben — das ist AP-C. Bis dahin analysiert Traktor beim Import alle{" "}
            {items.length}.
          </p>
        </div>
      </section>
    </div>
  );
}
