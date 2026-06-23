import type { Track } from "../lib/nml";
import type { PersistState } from "../lib/store/types";
import { EMPTY_TAGS } from "../lib/store/types";
import { useStore, activeSet } from "../lib/store/StoreProvider";
import { compatibility, COMPAT_COLOR, COMPAT_LABEL } from "../lib/compat";
import { PHASE_COLOR } from "../lib/tags";
import { CaretLeft, CaretRight, X, WaveSine } from "@phosphor-icons/react";

const LANE = 300;
const TILE = 56;
const TOP = 30;
const BOT = 52;
const MINCOL = 78;

const DASH: Record<string, string> = { ok: "none", okay: "6 4", break: "1.5 4" };
const GRID = [
  { e: 9, label: "hoch" },
  { e: 5, label: "mitte" },
  { e: 1, label: "niedrig" },
];

function initials(artist: string): string {
  const p = artist.split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[1][0]).toUpperCase();
}

function topFor(energy: number | null): number {
  const e = Math.min(10, Math.max(1, energy ?? 1));
  const frac = (e - 1) / 9;
  return TOP + (1 - frac) * (LANE - TOP - BOT);
}

interface Props {
  state: PersistState;
  trackById: Map<string, Track>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function EnergyTimeline({ state, trackById, selectedId, onSelect }: Props) {
  const { dispatch } = useStore();
  const set = activeSet(state);
  const items = set.trackIds
    .map((id) => trackById.get(id))
    .filter((t): t is Track => Boolean(t));
  const n = items.length;
  const tagsOf = (t: Track) => state.tags[t.id] ?? EMPTY_TAGS;

  return (
    <section className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-[15px] font-medium text-ink">
          <WaveSine size={17} weight="regular" className="text-accent" />
          {set.name}
        </h2>
        <span className="font-mono text-[12px] text-ink-faint">{n} Tracks</span>
        <div className="ml-auto flex items-center gap-3 text-[11px]">
          {(["ok", "okay", "break"] as const).map((l) => (
            <span key={l} className="flex items-center gap-1.5 text-ink-soft">
              <span className="h-2 w-2 rounded-full" style={{ background: COMPAT_COLOR[l] }} />
              {COMPAT_LABEL[l]}
            </span>
          ))}
        </div>
      </header>

      {n === 0 ? (
        <div className="my-8 text-center text-[13px] text-ink-soft">
          Dieses Set ist leer. Wechsle zu <span className="text-ink">Library</span> und füge Tracks hinzu —
          hier siehst du dann die Energiekurve und ob Übergänge sitzen.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto pb-1">
          <div className="relative" style={{ height: LANE, minWidth: n * MINCOL }}>
            {/* Energie-Gridlines */}
            {GRID.map((g) => (
              <div
                key={g.e}
                className="pointer-events-none absolute inset-x-0 flex items-center"
                style={{ top: topFor(g.e) }}
              >
                <span className="w-12 flex-none pr-2 text-right font-mono text-[10px] text-ink-faint">
                  {g.label}
                </span>
                <span className="h-px flex-1" style={{ background: "var(--color-line)" }} />
              </div>
            ))}

            {/* Übergangs-Linien (Ampel) */}
            {n > 1 && (
              <svg
                className="pointer-events-none absolute inset-0"
                width="100%"
                height={LANE}
                viewBox={`0 0 ${n} ${LANE}`}
                preserveAspectRatio="none"
              >
                {items.slice(1).map((cur, k) => {
                  const prev = items[k];
                  const c = compatibility(prev, cur, tagsOf(prev), tagsOf(cur));
                  return (
                    <line
                      key={k}
                      x1={k + 0.5}
                      y1={topFor(tagsOf(prev).energy)}
                      x2={k + 1.5}
                      y2={topFor(tagsOf(cur).energy)}
                      stroke={COMPAT_COLOR[c.level]}
                      strokeWidth={1.5}
                      strokeDasharray={DASH[c.level]}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
              </svg>
            )}

            {/* Spalten: Phasen-Tint + Tile + Controls */}
            <div className="absolute inset-0 flex">
              {items.map((t, i) => {
                const tags = tagsOf(t);
                const phaseColor = tags.phase ? PHASE_COLOR[tags.phase] : null;
                const center = topFor(tags.energy);
                const selected = t.id === selectedId;
                return (
                  <div
                    key={`${t.id}-${i}`}
                    className="group relative flex-1"
                    style={{ minWidth: MINCOL }}
                  >
                    {phaseColor && (
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{ background: `color-mix(in oklab, ${phaseColor} 9%, transparent)` }}
                      />
                    )}

                    <button
                      onClick={() => onSelect(t.id)}
                      className="absolute left-1/2 flex items-center justify-center overflow-hidden rounded-md border transition-transform active:scale-[0.97]"
                      style={{
                        top: center - TILE / 2,
                        width: TILE,
                        height: TILE,
                        marginLeft: -TILE / 2,
                        borderColor: selected ? "var(--color-accent)" : "var(--color-line)",
                        borderStyle: tags.energy == null ? "dashed" : "solid",
                        boxShadow: selected ? "0 0 0 1px var(--color-accent)" : "none",
                        background: phaseColor
                          ? `radial-gradient(120% 120% at 70% 15%, color-mix(in oklab, ${phaseColor} 42%, var(--color-base)) 0%, var(--color-base) 75%)`
                          : "var(--color-raise)",
                      }}
                      title={`${t.title} — ${t.artist}`}
                    >
                      <span
                        className="font-mono text-[15px] font-medium"
                        style={{
                          color: phaseColor
                            ? `color-mix(in oklab, ${phaseColor} 65%, var(--color-ink))`
                            : "var(--color-ink-faint)",
                        }}
                      >
                        {initials(t.artist)}
                      </span>
                      {t.keyCamelot && (
                        <span
                          className="absolute bottom-0.5 right-0.5 rounded px-1 font-mono text-[9px] font-medium"
                          style={{
                            background: "color-mix(in oklab, var(--color-base) 70%, transparent)",
                            color: "var(--color-accent)",
                          }}
                        >
                          {t.keyCamelot}
                        </span>
                      )}
                    </button>

                    {/* Label + Meta unter der Spur */}
                    <div className="absolute inset-x-0 px-1 text-center" style={{ top: LANE - BOT + 8 }}>
                      <div className="truncate text-[11px] font-medium text-ink">{t.title}</div>
                      <div className="truncate font-mono text-[10px] text-ink-faint">
                        {t.bpm != null ? t.bpm.toFixed(0) : "—"} ·{" "}
                        {tags.energy != null ? `E${tags.energy}` : "E–"}
                      </div>
                    </div>

                    {/* Reorder/Remove auf Hover */}
                    <div
                      className="absolute inset-x-0 flex justify-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                      style={{ top: center + TILE / 2 + 4 }}
                    >
                      <Ctl label="links" onClick={() => dispatch({ type: "moveInSet", index: i, dir: -1 })}>
                        <CaretLeft size={11} weight="bold" />
                      </Ctl>
                      <Ctl label="entfernen" onClick={() => dispatch({ type: "removeFromSet", index: i })}>
                        <X size={11} weight="bold" />
                      </Ctl>
                      <Ctl label="rechts" onClick={() => dispatch({ type: "moveInSet", index: i, dir: 1 })}>
                        <CaretRight size={11} weight="bold" />
                      </Ctl>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-ink-faint">
        Höhe = Energie · Spalten-Tönung = Phase · Linien = Übergang (Harmonik + Tempo + Energie).
        Ungetaggte Energie sitzt unten (gestrichelt) bis du sie im Inspector setzt.
      </p>
    </section>
  );
}

function Ctl({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="flex h-5 w-5 items-center justify-center rounded border border-line bg-surface text-ink-faint hover:text-ink active:translate-y-[1px]"
    >
      {children}
    </button>
  );
}
