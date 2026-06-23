import { useCallback, useEffect, useMemo, useState } from "react";
import { parseNml, type Track } from "./lib/nml";
import { PHASES, PHASE_COLOR, type Phase } from "./lib/tags";
import { useStore, getTags, activeSet } from "./lib/store/StoreProvider";
import { isTagged, type PersistState } from "./lib/store/types";
import { CoverWall } from "./components/CoverWall";
import { Inspector } from "./components/Inspector";
import { SetPanel } from "./components/SetPanel";
import { EnergyTimeline } from "./components/EnergyTimeline";
import { SetCanvas } from "./components/SetCanvas";
import { BatchBar } from "./components/BatchBar";
import { SmartCratesBar } from "./components/SmartCratesBar";
import { HealthView } from "./components/HealthView";
import { crateMatches } from "./lib/smartcrate";
import {
  Waveform,
  GridFour,
  WaveSine,
  Graph,
  Heartbeat,
  MagnifyingGlass,
  Checks,
} from "@phosphor-icons/react";

type Filter = Phase | "all" | "untagged";
type View = "library" | "timeline" | "canvas" | "health";
type SortKey = "order" | "title" | "artist" | "bpm" | "key" | "energy";

function camelotVal(c: string | null): number {
  if (!c) return Infinity;
  const m = c.match(/^(\d{1,2})([AB])$/);
  if (!m) return Infinity;
  return parseInt(m[1], 10) * 2 + (m[2] === "B" ? 1 : 0);
}

function cmpTracks(a: Track, b: Track, key: SortKey, state: PersistState): number {
  switch (key) {
    case "title":
      return a.title.localeCompare(b.title);
    case "artist":
      return a.artist.localeCompare(b.artist);
    case "bpm":
      return (a.bpm ?? Infinity) - (b.bpm ?? Infinity);
    case "key":
      return camelotVal(a.keyCamelot) - camelotVal(b.keyCamelot);
    case "energy":
      return (getTags(state, a.id).energy ?? Infinity) - (getTags(state, b.id).energy ?? Infinity);
    default:
      return 0;
  }
}

// Bevorzugt die lokal importierte Library (MP3-Import / echte .nml),
// fällt sonst auf die mitgelieferte Beispiel-Fixture zurück.
async function loadCollection(): Promise<string> {
  for (const url of ["/collection.local.nml", "/collection.sample.nml"]) {
    const r = await fetch(url);
    if (r.ok) return r.text();
  }
  throw new Error("Keine collection.nml gefunden.");
}

export function App() {
  const { state, dispatch } = useStore();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>("library");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("order");
  const [selectMode, setSelectMode] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [activeCrateId, setActiveCrateId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadCollection()
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
    let list = tracks;
    if (filter === "untagged") list = list.filter((t) => !isTagged(getTags(state, t.id)));
    else if (filter !== "all") list = list.filter((t) => getTags(state, t.id).phase === filter);

    const crate = activeCrateId ? state.smartCrates.find((c) => c.id === activeCrateId) : null;
    if (crate) list = list.filter((t) => crateMatches(t, getTags(state, t.id), crate));

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q),
      );
    }
    if (sortKey !== "order") {
      list = [...list].sort((a, b) => cmpTracks(a, b, sortKey, state));
    }
    return list;
  }, [tracks, filter, search, sortKey, state, activeCrateId]);

  const onSelect = useCallback((id: string) => setSelectedId(id), []);
  const onAdd = useCallback(
    (id: string) => dispatch({ type: "addToSet", trackId: id }),
    [dispatch],
  );
  const onToggle = useCallback((id: string) => {
    setSelection((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);
  const toggleSelectMode = () => {
    setSelectMode((m) => !m);
    setSelection(new Set());
  };

  const selectedTrack = selectedId ? trackById.get(selectedId) ?? null : null;

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-[1400px] px-4 py-7 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="flex items-center gap-2 text-[18px] font-medium tracking-tight text-ink">
          <Waveform size={20} weight="regular" className="text-accent" />
          SetForge
        </h1>
        <div className="flex items-center gap-0.5 rounded-md border border-line p-0.5">
          <ViewTab active={view === "library"} onClick={() => setView("library")}>
            <GridFour size={14} weight="regular" /> Library
          </ViewTab>
          <ViewTab active={view === "timeline"} onClick={() => setView("timeline")}>
            <WaveSine size={14} weight="regular" /> Timeline
          </ViewTab>
          <ViewTab active={view === "canvas"} onClick={() => setView("canvas")}>
            <Graph size={14} weight="regular" /> Canvas
          </ViewTab>
          <ViewTab active={view === "health"} onClick={() => setView("health")}>
            <Heartbeat size={14} weight="regular" /> Health
          </ViewTab>
        </div>
        {!loading && !error && (
          <span className="ml-auto font-mono text-[12px] text-ink-soft">
            {tracks.length} Tracks · {taggedCount} getaggt
          </span>
        )}
      </header>

      {view === "library" ? (
        <>
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

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <MagnifyingGlass
                size={15}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Titel oder Artist suchen…"
                className="h-8 w-full rounded-md border border-line bg-base pl-8 pr-2 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-line-strong"
              />
            </div>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="h-8 rounded-md border border-line bg-base px-2 text-[12px] text-ink outline-none focus:border-line-strong"
            >
              <option value="order">hinzugefügt</option>
              <option value="title">Titel</option>
              <option value="artist">Artist</option>
              <option value="bpm">BPM</option>
              <option value="key">Key</option>
              <option value="energy">Energie</option>
            </select>
            <button
              onClick={toggleSelectMode}
              className="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors active:translate-y-[1px]"
              style={{
                borderColor: selectMode ? "var(--color-accent)" : "var(--color-line)",
                color: selectMode ? "var(--color-accent)" : "var(--color-ink-soft)",
              }}
            >
              <Checks size={14} weight="regular" /> Auswahl
            </button>
          </div>

          <SmartCratesBar
            tracks={tracks}
            state={state}
            activeCrateId={activeCrateId}
            onPick={setActiveCrateId}
          />

          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_340px]">
            <main>
              {selectMode && (
                <BatchBar
                  ids={[...selection]}
                  visibleCount={shown.length}
                  onSelectAllVisible={() => setSelection(new Set(shown.map((t) => t.id)))}
                  onClear={() => setSelection(new Set())}
                />
              )}
              <CoverWall
                tracks={shown}
                state={state}
                setIds={setIds}
                selectedId={selectedId}
                loading={loading}
                error={error}
                selectMode={selectMode}
                selection={selection}
                onSelect={onSelect}
                onAdd={onAdd}
                onToggle={onToggle}
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
        </>
      ) : view === "timeline" ? (
        <div className="mt-7 flex flex-col gap-6">
          <EnergyTimeline
            state={state}
            trackById={trackById}
            selectedId={selectedId}
            onSelect={onSelect}
          />
          <div className="lg:max-w-md">
            <Inspector
              track={selectedTrack}
              tags={selectedTrack ? getTags(state, selectedTrack.id) : { energy: null, phase: null, vibe: [] }}
              inSet={selectedTrack ? setIds.has(selectedTrack.id) : false}
            />
          </div>
        </div>
      ) : view === "canvas" ? (
        <div className="mt-7 flex flex-col gap-6">
          <SetCanvas
            state={state}
            trackById={trackById}
            selectedId={selectedId}
            onSelect={onSelect}
          />
          <div className="lg:max-w-md">
            <Inspector
              track={selectedTrack}
              tags={selectedTrack ? getTags(state, selectedTrack.id) : { energy: null, phase: null, vibe: [] }}
              inSet={selectedTrack ? setIds.has(selectedTrack.id) : false}
            />
          </div>
        </div>
      ) : (
        <HealthView
          tracks={tracks}
          state={state}
          onPick={(id) => {
            setSelectedId(id);
            setView("library");
          }}
        />
      )}

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

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-colors"
      style={{
        background: active ? "var(--color-raise)" : "transparent",
        color: active ? "var(--color-ink)" : "var(--color-ink-soft)",
      }}
    >
      {children}
    </button>
  );
}
