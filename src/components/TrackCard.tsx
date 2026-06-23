import { memo } from "react";
import type { Track } from "../lib/nml";
import { demoTags, PHASE_COLOR, PHASE_LABEL } from "../lib/tags";

function initials(artist: string): string {
  const parts = artist.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

interface Props {
  track: Track;
}

// Cover-Platzhalter: getönt nach der (Demo-)Phase des Tracks, damit das Artwork
// schon mit dem Farbsystem spricht, bis echte Cover aus den Dateien gezogen werden.
export const TrackCard = memo(function TrackCard({ track }: Props) {
  const { phase, energy } = demoTags(track.id);
  const phaseColor = PHASE_COLOR[phase];

  return (
    <article className="group flex flex-col">
      <div
        className="relative aspect-square w-full overflow-hidden rounded-lg border border-line transition-transform duration-200 group-active:scale-[0.98]"
        style={{
          background: `radial-gradient(120% 120% at 70% 15%, color-mix(in oklab, ${phaseColor} 40%, var(--color-base)) 0%, var(--color-base) 70%)`,
        }}
      >
        <span
          className="absolute inset-0 flex items-center justify-center font-mono text-3xl font-medium tracking-tight"
          style={{ color: `color-mix(in oklab, ${phaseColor} 65%, var(--color-ink))` }}
        >
          {initials(track.artist)}
        </span>
        <span
          className="absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            background: "color-mix(in oklab, var(--color-base) 70%, transparent)",
            color: phaseColor,
          }}
        >
          {PHASE_LABEL[phase]}
        </span>
        {track.keyCamelot && (
          <span
            className="absolute bottom-2 right-2 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium"
            style={{
              background: "color-mix(in oklab, var(--color-base) 70%, transparent)",
              color: "var(--color-accent)",
            }}
          >
            {track.keyCamelot}
          </span>
        )}
      </div>

      <div className="mt-2 min-w-0">
        <div className="truncate text-[13px] font-medium text-ink">{track.title}</div>
        <div className="truncate text-[12px] text-ink-soft">{track.artist}</div>
        <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-ink-faint">
          {track.bpm != null && <span>{track.bpm.toFixed(1)}</span>}
          <span>·</span>
          <span>E{energy}</span>
        </div>
      </div>
    </article>
  );
});
