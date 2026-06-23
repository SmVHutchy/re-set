import { useCallback, useEffect, useMemo, useState } from "react";
import { parseNml, type Track } from "./lib/nml";
import { PHASES, PHASE_COLOR, type Phase } from "./lib/tags";
import { useStore, getTags, activeSet } from "./lib/store/StoreProvider";
import { isTagged } from "./lib/store/types";
import { CoverWall } from "./components/CoverWall";
import { Inspector } from "./components/Inspector";
import { SetPanel } from "./components/SetPanel";
import { Waveform } from "@phosphor-icons/react";

type Filter = Phase | "all" | "untagged";

export function App() {
  const { state, dispatch } = useStore();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/collection.sample.nml")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((xml) => {
        if (!alive) return;
        setTracks(parseNml(xml));
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const trackById = useMemo(() => {
    const m = new Map<string, Track>();
    for (const t of tracks) m.set(t.id, t);
    return m;
  }, [tracks]);

  const setIds = useMemo(() => new Set(activeSet(state).trackIds), [state]);

  const taggedCount = useMemo(
    () => tracks.reduce((n, t) => n + (isTagged(getTags(state, t.id)) ? 1 : 0), 0),
    [tracks, state],
  );

  const shown = useMemo(() => {
    if (filter === "all") return tracks;
    if (filter === "untagged") return tracks.filter((t) => !isTagged(getTags(state, t.id)));
    return tracks.filter((t) => getTags(state, t.id).phase === filter);
  }, [tracks, filter, state]);

  const onSelect = useCallback((id: string) => setSelectedId(id), []);
  const onAdd = useCallback(
    (id: string) => dispatch({ type: "addToSet", trackId: id }),
    [dispatch],
  );

  const selectedTrack = selectedId ? trackById.get(selectedId) ?? null : null;

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-[1400px] px-4 py-7 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="flex items-center gap-2 text-[18px] font-medium tracking-tight text-ink">
          <Waveform size={20} weight="regular" className="text-accent" />
          SetForge
        </h1>
        <span className="text-[13px] text-ink-faint">Library &amp; Set-Planung</span>
        {!loading && !error && (
          <span className="ml-auto font-mono text-[12px] text-ink-soft">
            {tracks.length} Tracks · {taggedCount} getaggt
          </span>
        )}
      </header>

      <nav className="mt-6 flex flex-wrap items-center gap-2">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          alle
        </FilterChip>
        {PHASES.map((p) => (
          <FilterChip key={p} active={filter === p} color={PHASE_COLOR[p]} onClick={() => setFilter(p)}>
            {p}
          </FilterChip>
        ))}
        <FilterChip active={filter === "untagged"} onClick={() => setFilter("untagged")}>
          ungetaggt
        </FilterChip>
      </nav>

      <div className="mt-7 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_340px]">
        <main>
          <CoverWall
            tracks={shown}
            state={state}
            setIds={setIds}
            selectedId={selectedId}
            loading={loading}
            error={error}
            onSelect={onSelect}
            onAdd={onAdd}
          />
        </main>

        <aside className="flex flex-col gap-6 self-start lg:sticky lg:top-6">
          <Inspector
            track={selectedTrack}
            tags={selectedTrack ? getTags(state, selectedTrack.id) : { energy: null, phase: null, vibe: [] }}
            inSet={selectedTrack ? setIds.has(selectedTrack.id) : false}
          />
          <SetPanel state={state} trackById={trackById} onSelect={onSelect} />
        </aside>
      </div>

      <footer className="mt-12 border-t border-line pt-4 text-[11px] text-ink-faint">
        Tags &amp; Sets liegen lokal (localStorage), bleiben über Reloads erhalten — später SQLite.
        Key &amp; BPM kommen real aus der collection.nml; Kompatibilität = Harmonik + Tempo + Energie (§7.1).
      </footer>
    </div>
  );
}

function FilterChip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors duration-150 active:translate-y-[1px]"
      style={{
        borderColor: active ? "var(--color-line-strong)" : "var(--color-line)",
        background: active ? "var(--color-raise)" : "transparent",
        color: active ? "var(--color-ink)" : "var(--color-ink-soft)",
      }}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />}
      {children}
    </button>
  );
}
