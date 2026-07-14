import type { Track } from "../lib/nml";
import type { PersistState } from "../lib/store/types";
import { EMPTY_TAGS } from "../lib/store/types";
import { getTags } from "../lib/store/StoreProvider";
import { TrackCard } from "./TrackCard";
import { MagnifyingGlass, Folder } from "@phosphor-icons/react";

const GRID_STYLE = { gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" };

interface Props {
  tracks: Track[];
  state: PersistState;
  setIds: Set<string>;
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  selectMode: boolean;
  selection: Set<string>;
  groupByFolder?: boolean;
  onSelect: (id: string) => void;
  onAdd: (id: string) => void;
  onToggle: (id: string) => void;
  onPreview: (id: string) => void;
}

// Reihenfolge-erhaltende Gruppierung nach Herkunfts-Ordner.
function groupByFolderLabel(tracks: Track[]): { folder: string; items: Track[] }[] {
  const groups: { folder: string; items: Track[] }[] = [];
  const index = new Map<string, number>();
  for (const t of tracks) {
    const key = t.folder ?? "Ohne Ordner";
    let i = index.get(key);
    if (i === undefined) {
      i = groups.length;
      index.set(key, i);
      groups.push({ folder: key, items: [] });
    }
    groups[i].items.push(t);
  }
  return groups;
}

function SkeletonGrid() {
  return (
    <div className="grid gap-x-4 gap-y-5" style={GRID_STYLE}>
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

export function CoverWall({
  tracks,
  state,
  setIds,
  selectedId,
  loading,
  error,
  selectMode,
  selection,
  groupByFolder,
  onSelect,
  onAdd,
  onToggle,
  onPreview,
}: Props) {
  if (loading) return <SkeletonGrid />;

  if (error) {
    return (
      <div className="rounded-lg border border-line bg-surface px-5 py-8 text-center">
        <div className="text-[14px] font-medium text-accent">
          collection.nml konnte nicht gelesen werden
        </div>
        <p className="mx-auto mt-1 max-w-[48ch] text-[13px] text-ink-soft">{error}</p>
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed border-line-strong px-5 py-14 text-center">
        <MagnifyingGlass size={26} className="text-ink-faint" weight="regular" />
        <div className="mt-3 text-[14px] font-medium text-ink">Keine Tracks in dieser Ansicht</div>
        <p className="mt-1 max-w-[44ch] text-[13px] text-ink-soft">
          Filter zurücksetzen oder eine echte{" "}
          <span className="font-mono text-ink">collection.nml</span> nach{" "}
          <span className="font-mono text-ink">public/collection.sample.nml</span> legen.
        </p>
      </div>
    );
  }

  const card = (t: Track) => (
    <TrackCard
      key={t.id}
      track={t}
      tags={state.tags[t.id] ?? EMPTY_TAGS}
      selected={t.id === selectedId}
      inSet={setIds.has(t.id)}
      selectMode={selectMode}
      checked={selection.has(t.id)}
      onSelect={onSelect}
      onAdd={onAdd}
      onToggle={onToggle}
      onPreview={onPreview}
    />
  );

  if (groupByFolder) {
    return (
      <div className="flex flex-col gap-8">
        {groupByFolderLabel(tracks).map((g) => (
          <section key={g.folder}>
            <div className="mb-3 flex items-center gap-2 border-b border-line pb-2">
              <Folder size={15} weight="regular" className="flex-none text-ink-faint" />
              <h3 className="truncate text-[13px] font-medium text-ink">{g.folder}</h3>
              <span className="font-mono text-[11px] text-ink-faint">{g.items.length}</span>
            </div>
            <div className="grid gap-x-4 gap-y-5" style={GRID_STYLE}>
              {g.items.map(card)}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-x-4 gap-y-5" style={GRID_STYLE}>
      {tracks.map(card)}
    </div>
  );
}

// re-export für bequemen Zugriff (vermeidet zusätzliche Imports im App-Modul)
export { getTags };
