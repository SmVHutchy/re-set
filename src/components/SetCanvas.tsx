import { useEffect, useRef, useState } from "react";
import type { Track } from "../lib/nml";
import type { PersistState } from "../lib/store/types";
import { EMPTY_TAGS } from "../lib/store/types";
import { useStore, activeSet } from "../lib/store/StoreProvider";
import { compatibility, COMPAT_COLOR } from "../lib/compat";
import { PHASES, PHASE_COLOR } from "../lib/tags";
import { ArrowsOut, Columns } from "@phosphor-icons/react";

const HEIGHT = 460;
const CARD = 84;
const PAD = 20;
const STEP = 116;
const DASH: Record<string, string> = { ok: "none", okay: "7 5", break: "2 5" };

function initials(artist: string): string {
  const p = artist.split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[1][0]).toUpperCase();
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Props {
  state: PersistState;
  trackById: Map<string, Track>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function SetCanvas({ state, trackById, selectedId, onSelect }: Props) {
  const { dispatch } = useStore();
  const set = activeSet(state);
  const items = set.trackIds
    .map((id) => trackById.get(id))
    .filter((t): t is Track => Boolean(t));

  const boardRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [zonesOn, setZonesOn] = useState(false);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const grab = useRef<{ id: string; dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);

  const tagsOf = (tr: Track) => state.tags[tr.id] ?? EMPTY_TAGS;
  const selectedTrack = selectedId ? trackById.get(selectedId) ?? null : null;

  useEffect(() => {
    if (!boardRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(boardRef.current);
    return () => ro.disconnect();
  }, []);

  const cols = Math.max(1, Math.floor((width - PAD) / STEP));
  const posFor = (id: string, i: number) => {
    if (drag && drag.id === id) return { x: drag.x, y: drag.y };
    const saved = set.positions?.[id];
    if (saved) return saved;
    return { x: PAD + (i % cols) * STEP, y: PAD + Math.floor(i / cols) * STEP };
  };

  const onPointerDown = (e: React.PointerEvent, id: string, x: number, y: number) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const r = boardRef.current!.getBoundingClientRect();
    grab.current = {
      id,
      dx: e.clientX - r.left - x,
      dy: e.clientY - r.top - y,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
    };
    setDrag({ id, x, y });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g) return;
    if (Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) > 4) g.moved = true;
    const r = boardRef.current!.getBoundingClientRect();
    setDrag({
      id: g.id,
      x: clamp(e.clientX - r.left - g.dx, 0, r.width - CARD),
      y: clamp(e.clientY - r.top - g.dy, 0, HEIGHT - CARD),
    });
  };

  const onPointerUp = () => {
    const g = grab.current;
    if (g) {
      if (!g.moved) onSelect(g.id);
      else if (drag) {
        dispatch({ type: "moveCard", trackId: g.id, x: drag.x, y: drag.y });
        if (zonesOn) {
          const zi = Math.min(3, Math.max(0, Math.floor(((drag.x + CARD / 2) / width) * 4)));
          dispatch({ type: "setPhase", id: g.id, phase: PHASES[zi] });
        }
      }
    }
    grab.current = null;
    setDrag(null);
  };

  const centers = items.map((t, i) => {
    const p = posFor(t.id, i);
    return { x: p.x + CARD / 2, y: p.y + CARD / 2 };
  });

  return (
    <section className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-medium text-ink">{set.name}</h2>
        <span className="font-mono text-[12px] text-ink-faint">{items.length} Tracks</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setZonesOn((z) => !z)}
            className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] transition-colors active:translate-y-[1px]"
            style={{
              borderColor: zonesOn ? "var(--color-accent)" : "var(--color-line)",
              color: zonesOn ? "var(--color-accent)" : "var(--color-ink-soft)",
            }}
          >
            <Columns size={13} weight="regular" /> Zonen
          </button>
          <button
            onClick={() => dispatch({ type: "clearLayout" })}
            className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[12px] text-ink-soft transition-colors active:translate-y-[1px]"
          >
            <ArrowsOut size={13} weight="regular" /> Auto-Layout
          </button>
        </div>
      </header>

      <div
        ref={boardRef}
        className="relative mt-4 overflow-hidden rounded-md border border-line"
        style={{
          height: HEIGHT,
          background:
            "repeating-linear-gradient(0deg, transparent 0 28px, color-mix(in oklab, var(--color-line) 30%, transparent) 28px 29px), repeating-linear-gradient(90deg, transparent 0 28px, color-mix(in oklab, var(--color-line) 30%, transparent) 28px 29px), var(--color-base)",
        }}
      >
        {zonesOn &&
          PHASES.map((p, i) => (
            <div
              key={p}
              className="pointer-events-none absolute bottom-0 top-0 flex justify-center pt-1.5"
              style={{
                left: `${i * 25}%`,
                width: "25%",
                borderLeft: i ? "1px dashed var(--color-line)" : "none",
                background: `color-mix(in oklab, ${PHASE_COLOR[p]} 7%, transparent)`,
              }}
            >
              <span className="text-[10px] font-medium" style={{ color: PHASE_COLOR[p] }}>
                {p}
              </span>
            </div>
          ))}
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-ink-soft">
            Leeres Set — füge in Library Tracks hinzu, dann ordne sie hier frei an.
          </div>
        ) : (
          <>
            {/* Verbindungslinien in Set-Reihenfolge */}
            <svg className="pointer-events-none absolute inset-0" width="100%" height={HEIGHT}>
              {centers.slice(1).map((c, k) => {
                const prev = items[k];
                const cur = items[k + 1];
                const level = compatibility(
                  prev,
                  cur,
                  state.tags[prev.id] ?? EMPTY_TAGS,
                  state.tags[cur.id] ?? EMPTY_TAGS,
                ).level;
                return (
                  <line
                    key={k}
                    x1={centers[k].x}
                    y1={centers[k].y}
                    x2={c.x}
                    y2={c.y}
                    stroke={COMPAT_COLOR[level]}
                    strokeWidth={1.5}
                    strokeDasharray={DASH[level]}
                  />
                );
              })}
            </svg>

            {items.map((t, i) => {
              const p = posFor(t.id, i);
              const tags = state.tags[t.id] ?? EMPTY_TAGS;
              const phaseColor = tags.phase ? PHASE_COLOR[tags.phase] : null;
              const selected = t.id === selectedId;
              const compatible =
                selectedTrack && t.id !== selectedId
                  ? compatibility(selectedTrack, t, tagsOf(selectedTrack), tags).level === "ok"
                  : false;
              return (
                <div
                  key={t.id}
                  onPointerDown={(e) => onPointerDown(e, t.id, p.x, p.y)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  className="absolute cursor-grab touch-none select-none active:cursor-grabbing"
                  style={{ left: p.x, top: p.y, width: CARD }}
                >
                  <div
                    className="relative overflow-hidden rounded-md border"
                    style={{
                      width: CARD,
                      height: CARD,
                      borderColor: selected
                        ? "var(--color-accent)"
                        : compatible
                          ? "var(--color-sig)"
                          : "var(--color-line)",
                      boxShadow: selected
                        ? "0 0 0 1px var(--color-accent)"
                        : compatible
                          ? "0 0 0 1px var(--color-sig)"
                          : "none",
                      background: phaseColor
                        ? `radial-gradient(120% 120% at 70% 15%, color-mix(in oklab, ${phaseColor} 42%, var(--color-base)) 0%, var(--color-base) 75%)`
                        : "var(--color-raise)",
                    }}
                  >
                    {t.coverPath ? (
                      <img
                        src={t.coverPath}
                        alt=""
                        draggable={false}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <span
                        className="absolute inset-0 flex items-center justify-center font-mono text-xl font-medium"
                        style={{
                          color: phaseColor
                            ? `color-mix(in oklab, ${phaseColor} 65%, var(--color-ink))`
                            : "var(--color-ink-faint)",
                        }}
                      >
                        {initials(t.artist)}
                      </span>
                    )}
                    <span
                      className="absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded font-mono text-[9px] font-medium"
                      style={{
                        background: "color-mix(in oklab, var(--color-base) 72%, transparent)",
                        color: "var(--color-ink-soft)",
                      }}
                    >
                      {i + 1}
                    </span>
                  </div>
                  <div className="mt-1 w-[84px] truncate text-center text-[10px] text-ink-soft">
                    {t.title}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <p className="mt-3 text-[11px] text-ink-faint">
        Karten frei ziehen · Linien = Übergänge in Set-Reihenfolge (Kompatibilität) · Klick wählt einen Track ·
        Auto-Layout ordnet neu.
      </p>
    </section>
  );
}
