import type { Track } from "../lib/nml";
import { TrackCard } from "./TrackCard";
import { MagnifyingGlass } from "@phosphor-icons/react";

interface Props {
  tracks: Track[];
  loading: boolean;
  error: string | null;
}

function SkeletonGrid() {
  return (
    <div
      className="grid gap-x-4 gap-y-5"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex flex-col">
          <div className="sf-skeleton aspect-square w-full rounded-lg" />
          <div className="sf-skeleton mt-2 h-3 w-3/4 rounded" />
          <div className="sf-skeleton mt-1.5 h-2.5 w-1/2 rounded" />
        </div>
      ))}
    </div>
  );
}

export function CoverWall({ tracks, loading, error }: Props) {
  if (loading) return <SkeletonGrid />;

  if (error) {
    return (
      <div className="rounded-lg border border-line bg-surface px-5 py-8 text-center">
        <div className="text-[14px] font-medium text-accent">collection.nml konnte nicht gelesen werden</div>
        <p className="mx-auto mt-1 max-w-[48ch] text-[13px] text-ink-soft">{error}</p>
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed border-line-strong px-5 py-14 text-center">
        <MagnifyingGlass size={26} className="text-ink-faint" weight="regular" />
        <div className="mt-3 text-[14px] font-medium text-ink">Keine Tracks gefunden</div>
        <p className="mt-1 max-w-[44ch] text-[13px] text-ink-soft">
          Lege deine echte <span className="font-mono text-ink">collection.nml</span> nach{" "}
          <span className="font-mono text-ink">public/collection.sample.nml</span> und lade neu.
        </p>
      </div>
    );
  }

  return (
    <div
      className="grid gap-x-4 gap-y-5"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
    >
      {tracks.map((t) => (
        <TrackCard key={t.id} track={t} />
      ))}
    </div>
  );
}
