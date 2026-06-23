import { useMemo } from "react";
import type { Track } from "../lib/nml";
import type { PersistState } from "../lib/store/types";
import { EMPTY_TAGS, isTagged } from "../lib/store/types";
import { PHASES, PHASE_COLOR, type Phase } from "../lib/tags";
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
    const genres = new Map<string, number>();
    const phaseCounts: Record<Phase, number> = { pre: 0, mid: 0, peak: 0, late: 0 };
    const energyCounts = new Array(11).fill(0) as number[];

    for (const t of tracks) {
      if (!t.keyCamelot) missingKey.push(t);
      if (t.bpm == null) missingBpm.push(t);
      if (!t.coverPath) missingCover.push(t);
      const tg = state.tags[t.id] ?? EMPTY_TAGS;
      if (!isTagged(tg)) untagged++;
      if (tg.phase) phaseCounts[tg.phase]++;
      if (tg.energy != null) energyCounts[tg.energy]++;
      const g = t.genre?.trim();
      if (g) genres.set(g, (genres.get(g) ?? 0) + 1);
      const k = `${t.title.toLowerCase()}|${t.artist.toLowerCase()}`;
      const arr = byName.get(k) ?? [];
      arr.push(t);
      byName.set(k, arr);
    }
    const dupes = [...byName.values()].filter((g) => g.length > 1);
    const incomplete = tracks.filter((t) => !t.keyCamelot || t.bpm == null || !t.coverPath);
    const topGenres = [...genres.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return {
      missingKey,
      missingBpm,
      missingCover,
      untagged,
      dupes,
      incomplete,
      phaseCounts,
      energyCounts,
      topGenres,
    };
  }, [tracks, state]);

  const maxPhase = Math.max(1, ...PHASES.map((p) => health.phaseCounts[p]));
  const maxEnergy = Math.max(1, ...health.energyCounts);
  const maxGenre = Math.max(1, ...health.topGenres.map(([, c]) => c));

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

      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-3 text-[14px] font-medium text-ink">Verteilung</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div>
            <div className="mb-2 text-[12px] text-ink-soft">Phasen</div>
            {PHASES.map((p) => (
              <Bar key={p} label={p} value={health.phaseCounts[p]} max={maxPhase} color={PHASE_COLOR[p]} />
            ))}
          </div>
          <div>
            <div className="mb-2 text-[12px] text-ink-soft">Energie</div>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <Bar key={n} label={`E${n}`} value={health.energyCounts[n]} max={maxEnergy} color="var(--color-accent)" />
            ))}
          </div>
          <div>
            <div className="mb-2 text-[12px] text-ink-soft">Top-Genres</div>
            {health.topGenres.length === 0 ? (
              <div className="text-[12px] text-ink-faint">—</div>
            ) : (
              health.topGenres.map(([g, c]) => (
                <Bar key={g} label={g} value={c} max={maxGenre} color="var(--color-sig)" />
              ))
            )}
          </div>
        </div>
      </section>

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

function Bar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="mb-1 flex items-center gap-2">
      <span className="w-16 flex-none truncate text-[11px] text-ink-soft" title={label}>
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-raise">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-6 flex-none text-right font-mono text-[10px] text-ink-faint">{value}</span>
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
