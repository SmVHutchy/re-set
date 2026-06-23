import { memo } from "react";
import type { Track } from "../lib/nml";
import type { TrackTags } from "../lib/store/types";
import { PHASE_COLOR, PHASE_LABEL } from "../lib/tags";
import { Plus, Check } from "@phosphor-icons/react";

function initials(artist: string): string {
  const parts = artist.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

interface Props {
  track: Track;
  tags: TrackTags;
  selected: boolean;
  inSet: boolean;
  onSelect: (id: string) => void;
  onAdd: (id: string) => void;
}

export const TrackCard = memo(function TrackCard({
  track,
  tags,
  selected,
  inSet,
  onSelect,
  onAdd,
}: Props) {
  const phaseColor = tags.phase ? PHASE_COLOR[tags.phase] : null;

  return (
    <article className="group flex flex-col">
      <button
        onClick={() => onSelect(track.id)}
        className="relative aspect-square w-full overflow-hidden rounded-lg border text-left transition-transform duration-200 active:scale-[0.98]"
        style={{
          borderColor: selected ? "var(--color-accent)" : "var(--color-line)",
          boxShadow: selected ? "0 0 0 1px var(--color-accent)" : "none",
          background: phaseColor
            ? `radial-gradient(120% 120% at 70% 15%, color-mix(in oklab, ${phaseColor} 40%, var(--color-base)) 0%, var(--color-base) 70%)`
            : "var(--color-surface)",
        }}
      >
        {track.coverPath ? (
          <img
            src={track.coverPath}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span
            className="absolute inset-0 flex items-center justify-center font-mono text-3xl font-medium tracking-tight"
            style={{
              color: phaseColor
                ? `color-mix(in oklab, ${phaseColor} 65%, var(--color-ink))`
                : "var(--color-ink-faint)",
            }}
          >
            {initials(track.artist)}
          </span>
        )}

        {tags.phase && (
          <span
            className="absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              background: "color-mix(in oklab, var(--color-base) 70%, transparent)",
              color: phaseColor!,
            }}
          >
            {PHASE_LABEL[tags.phase]}
          </span>
        )}

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
      </button>

      <div className="mt-2 flex min-w-0 items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-ink">{track.title}</div>
          <div className="truncate text-[12px] text-ink-soft">{track.artist}</div>
          <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-ink-faint">
            {track.bpm != null && <span>{track.bpm.toFixed(1)}</span>}
            <span>·</span>
            <span>{tags.energy != null ? `E${tags.energy}` : "E–"}</span>
          </div>
        </div>
        <button
          onClick={() => onAdd(track.id)}
          aria-label={inSet ? "Im Set" : "Zum Set hinzufügen"}
          className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-md border transition-colors active:translate-y-[1px]"
          style={{
            borderColor: inSet ? "var(--color-sig)" : "var(--color-line)",
            color: inSet ? "var(--color-sig)" : "var(--color-ink-soft)",
          }}
        >
          {inSet ? <Check size={13} weight="bold" /> : <Plus size={13} weight="bold" />}
        </button>
      </div>
    </article>
  );
});
