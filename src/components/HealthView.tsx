import { useMemo } from "react";
import type { Track } from "../lib/nml";
import type { PersistState } from "../lib/store/types";
import { EMPTY_TAGS, isTagged } from "../lib/store/types";
import { WarningCircle } from "@phosphor-icons/react";

interface Props {
  tracks: Track[];
  state: PersistState;
  onPick: (id: string) => void;
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-md bg-raise p-3">
      <div className="text-[12px] text-ink-soft">{label}</div>
      <div
        className="mt-0.5 font-mono text-[22px] font-medium"
        style={{ color: accent && value > 0 ? "var(--color-accent)" : "var(--color-ink)" }}
      >
        {value}
      </div>
    </div>
  );
}

export function HealthView({ tracks, state, onPick }: Props) {
  const health = useMemo(() => {
    const missingKey: Track[] = [];
    const missingBpm: Track[] = [];
    const missingCover: Track[] = [];
    let untagged = 0;
    const byName = new Map<string, Track[]>();

    for (const t of tracks) {
      if (!t.keyCamelot) missingKey.push(t);
      if (t.bpm == null) missingBpm.push(t);
      if (!t.coverPath) missingCover.push(t);
      if (!isTagged(state.tags[t.id] ?? EMPTY_TAGS)) untagged++;
      const k = `${t.title.toLowerCase()}|${t.artist.toLowerCase()}`;
      const arr = byName.get(k) ?? [];
      arr.push(t);
      byName.set(k, arr);
    }
    const dupes = [...byName.values()].filter((g) => g.length > 1);
    const incomplete = tracks.filter((t) => !t.keyCamelot || t.bpm == null || !t.coverPath);
    return { missingKey, missingBpm, missingCover, untagged, dupes, incomplete };
  }, [tracks, state]);

  return (
    <div className="mt-7 flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Tracks" value={tracks.length} />
        <Metric label="ohne Key" value={health.missingKey.length} accent />
        <Metric label="ohne BPM" value={health.missingBpm.length} accent />
        <Metric label="ohne Cover" value={health.missingCover.length} accent />
        <Metric label="ungetaggt" value={health.untagged} />
        <Metric label="Duplikate" value={health.dupes.length} accent />
      </div>

      {health.dupes.length > 0 && (
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="mb-2 text-[14px] font-medium text-ink">Mögliche Duplikate</h2>
          <ul className="flex flex-col gap-2">
            {health.dupes.slice(0, 30).map((g, i) => (
              <li key={i} className="rounded-md border border-line p-2">
                <div className="text-[12px] font-medium text-ink">
                  {g[0].artist} – {g[0].title}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {g.map((t, j) => (
                    <button
                      key={j}
                      onClick={() => onPick(t.id)}
                      className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-soft hover:text-ink"
                      title={t.path ?? ""}
                    >
                      {(t.path ?? t.title).split("/").pop()}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {health.incomplete.length > 0 && (
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-[14px] font-medium text-ink">
            <WarningCircle size={16} weight="regular" className="text-accent" />
            Unvollständige Metadaten
          </h2>
          <ul className="flex flex-col">
            {health.incomplete.slice(0, 60).map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => onPick(t.id)}
                  className="flex w-full items-center gap-2 rounded px-1 py-1.5 text-left hover:bg-raise"
                >
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                    {t.artist} – {t.title}
                  </span>
                  <span className="flex flex-none gap-1">
                    {!t.keyCamelot && <Pill>Key</Pill>}
                    {t.bpm == null && <Pill>BPM</Pill>}
                    {!t.coverPath && <Pill>Cover</Pill>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {health.incomplete.length > 60 && (
            <div className="mt-2 text-[11px] text-ink-faint">
              +{health.incomplete.length - 60} weitere
            </div>
          )}
        </section>
      )}

      {health.dupes.length === 0 && health.incomplete.length === 0 && (
        <div className="rounded-lg border border-dashed border-line-strong px-5 py-12 text-center text-[13px] text-ink-soft">
          Alles sauber — keine Duplikate, keine fehlenden Keys/BPM/Cover.
        </div>
      )}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px]" style={{ color: "var(--color-accent)" }}>
      {children}
    </span>
  );
}
