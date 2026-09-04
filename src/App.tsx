import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { toast } from "./lib/toast";
import { Logo } from "./components/Logo";
import { Toaster } from "./components/Toaster";
import { HelpOverlay } from "./components/HelpOverlay";
import { ImportButton } from "./components/ImportButton";
import { UploadNmlButton } from "./components/UploadNmlButton";
import { LibraryManager } from "./components/LibraryManager";
import { DownloadPanel } from "./components/DownloadPanel";
import {
  CloudArrowDown,
  GridFour,
  WaveSine,
  Graph,
  Heartbeat,
  MagnifyingGlass,
  Checks,
  ArrowUUpLeft,
  ArrowUUpRight,
  Question,
  Folders,
  X,
} from "@phosphor-icons/react";

// Lazy: zieht wavesurfer.js in einen eigenen Chunk, der erst beim ersten
// Vorhören geladen wird (spart ~kB im initialen Bundle).
const MiniPlayer = lazy(() =>
  import("./components/MiniPlayer").then((m) => ({ default: m.MiniPlayer })),
);

type Filter = Phase | "all" | "untagged";
type View = "download" | "library" | "timeline" | "canvas" | "health";
type SortKey = "order" | "folder" | "title" | "artist" | "bpm" | "key" | "energy";

function camelotVal(c: string | null): number {
  if (!c) return Infinity;
  const m = c.match(/^(\d{1,2})([AB])$/);
  if (!m) return Infinity;
  return parseInt(m[1], 10) * 2 + (m[2] === "B" ? 1 : 0);
}

// Guard gegen Infinity - Infinity = NaN (beide Werte fehlen → gleichwertig).
const numCmp = (x: number, y: number) => (x === y ? 0 : x - y);

function cmpTracks(a: Track, b: Track, key: SortKey, state: PersistState): number {
  switch (key) {
    case "folder":
      return (a.folder ?? "").localeCompare(b.folder ?? "") || a.title.localeCompare(b.title);
    case "title":
      return a.title.localeCompare(b.title);
    case "artist":
      return a.artist.localeCompare(b.artist);
    case "bpm":
      return numCmp(a.bpm ?? Infinity, b.bpm ?? Infinity);
    case "key":
      return numCmp(camelotVal(a.keyCamelot), camelotVal(b.keyCamelot));
    case "energy":
      return numCmp(getTags(state, a.id).energy ?? Infinity, getTags(state, b.id).energy ?? Infinity);
    default:
      return 0;
  }
}

// Führt alle geladenen Ordner (collections/* + Alt-Datei) zu einer Library
// zusammen — deduped per Track-ID (= Pfad), damit ein Track in mehreren NMLs
// nur einmal auftaucht. Fällt ohne Server/Ordner auf die Beispiel-Fixture zurück.
async function loadLibrary(): Promise<Track[]> {
  try {
    const r = await fetch("/api/collections");
    if (r.ok) {
      const cols: { file: string }[] = await r.json();
      if (cols.length) {
        const lists = await Promise.all(
          cols.map(async (c) => {
            try {
              const x = await fetch(`/${c.file}`);
              return x.ok ? parseNml(await x.text()) : [];
            } catch {
              return []; // eine kaputte/ungültige Datei darf den Merge nicht killen
            }
          }),
        );
        const seen = new Set<string>();
        const merged: Track[] = [];
        for (const list of lists) {
          for (const t of list) {
            if (!seen.has(t.id)) {
              seen.add(t.id);
              merged.push(t);
            }
          }
        }
        if (merged.length) return merged;
      }
    }
  } catch {
    // kein Server / kein /api → Einzeldatei-Fallback
  }
  for (const url of ["/collection.local.nml", "/collection.sample.nml"]) {
    const r = await fetch(url);
    if (r.ok) return parseNml(await r.text());
  }
  throw new Error("Keine collection.nml gefunden.");
}

export function App() {
  const { state, dispatch, canUndo, canRedo } = useStore();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>("library");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>(
    () => (localStorage.getItem("reset.sort") as SortKey) || "order",
  );
  const [selectMode, setSelectMode] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [activeCrateId, setActiveCrateId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem("reset.onboarded") === "1");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    loadLibrary()
      .then((list) => {
        if (!alive) return;
        setTracks(list);
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

  // Sortier-/Gruppierwahl merken — u.a. damit „Ordner" nach dem Import aktiv bleibt.
  useEffect(() => {
    localStorage.setItem("reset.sort", sortKey);
  }, [sortKey]);

  const trackById = useMemo(() => {
    const m = new Map<string, Track>();
    for (const t of tracks) m.set(t.id, t);
    return m;
  }, [tracks]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "z") {
        if (typing) return;
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
        toast(e.shiftKey ? "Wiederholt" : "Rückgängig");
        return;
      }
      if (typing) {
        if (e.key === "Escape") el?.blur();
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setShowHelp((h) => !h);
        return;
      }
      if (e.key === "Escape") {
        setShowHelp(false);
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (!selectedId) return;
      if (e.key >= "1" && e.key <= "4") {
        const phase = PHASES[Number(e.key) - 1];
        dispatch({ type: "setPhase", id: selectedId, phase });
        toast(`Phase: ${phase}`);
        return;
      }
      if (e.key === "0") {
        dispatch({ type: "setPhase", id: selectedId, phase: null });
        return;
      }
      if (e.key === "+" || e.key === "=") {
        dispatch({ type: "addToSet", trackId: selectedId });
        toast("Ins Set");
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        if (!trackById.get(selectedId)?.audioPath) return;
        // Toggle: derselbe Track → Vorschau stoppen, sonst starten.
        setPreviewId((cur) => (cur === selectedId ? null : selectedId));
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, selectedId, trackById]);

  const setIds = useMemo(() => new Set(activeSet(state).trackIds), [state.sets, state.activeSetId]);

  const taggedCount = useMemo(
    () => tracks.reduce((n, t) => n + (isTagged(getTags(state, t.id)) ? 1 : 0), 0),
    [tracks, state.tags],
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
    // Bewusst nur state.tags/smartCrates statt des ganzen state: Set-Aktionen
    // (addToSet, reorder…) ändern state.sets und sollen die Library NICHT neu
    // filtern/sortieren.
  }, [tracks, filter, search, sortKey, state.tags, state.smartCrates, activeCrateId]);

  const onSelect = useCallback((id: string) => setSelectedId(id), []);
  const onAdd = useCallback(
    (id: string) => {
      dispatch({ type: "addToSet", trackId: id });
      toast("Ins Set");
    },
    [dispatch],
  );
  const onPreview = useCallback((id: string) => setPreviewId(id), []);
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
  const previewTrack = previewId ? trackById.get(previewId) ?? null : null;

  return (
    <div
      className="mx-auto min-h-[100dvh] w-full max-w-[1400px] px-4 py-7 sm:px-8 sm:py-10"
      style={{ paddingBottom: previewTrack ? 84 : undefined }}
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="flex items-center gap-2 text-[18px] font-medium tracking-tight text-ink">
          <Logo size={22} />
          <span className="font-bold tracking-tight">
            Re<span style={{ color: "var(--color-accent)" }}>:</span>SET
          </span>
        </h1>
        <div className="flex items-center gap-0.5 rounded-md border border-line p-0.5">
          <ViewTab active={view === "download"} onClick={() => setView("download")}>
            <CloudArrowDown size={14} weight="regular" /> Laden
          </ViewTab>
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
        <div className="ml-auto flex items-center gap-2">
          <UploadNmlButton />
          <ImportButton />
          <button
            onClick={() => setShowLibrary(true)}
            title="Geladene Ordner verwalten"
            className="flex h-8 items-center gap-1.5 rounded-md border border-line bg-base px-2.5 text-[12px] font-medium text-ink-soft transition-colors hover:text-ink"
          >
            <Folders size={14} weight="regular" /> Ordner
          </button>
          <div className="flex items-center gap-0.5">
            <HeaderIconBtn label="Rückgängig (⌘Z)" disabled={!canUndo} onClick={() => dispatch({ type: "undo" })}>
              <ArrowUUpLeft size={15} weight="regular" />
            </HeaderIconBtn>
            <HeaderIconBtn label="Wiederholen (⌘⇧Z)" disabled={!canRedo} onClick={() => dispatch({ type: "redo" })}>
              <ArrowUUpRight size={15} weight="regular" />
            </HeaderIconBtn>
            <HeaderIconBtn label="Shortcuts (?)" disabled={false} onClick={() => setShowHelp(true)}>
              <Question size={15} weight="regular" />
            </HeaderIconBtn>
          </div>
          {!loading && !error && (
            <span className="font-mono text-[12px] text-ink-soft">
              {tracks.length} Tracks · {taggedCount} getaggt
            </span>
          )}
        </div>
      </header>

      {!onboarded && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-line bg-raise p-3">
          <p className="flex-1 text-[13px] text-ink-soft">
            <span className="font-medium text-ink">So läuft Re:SET:</span> Tracks taggen (Energie/Phase) →
            mit <span className="font-mono text-ink">+</span> ins Set → in der <span className="text-ink">Timeline</span>{" "}
            die Energiekurve lesen → als <span className="font-mono text-ink">.m3u</span> exportieren. Drück{" "}
            <kbd className="rounded border border-line bg-base px-1 font-mono text-[11px] text-ink-soft">?</kbd> für
            alle Shortcuts.
          </p>
          <button
            onClick={() => {
              localStorage.setItem("reset.onboarded", "1");
              setOnboarded(true);
            }}
            aria-label="Hinweis schließen"
            className="flex h-6 w-6 flex-none items-center justify-center rounded text-ink-faint hover:text-ink"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      )}

      {view === "download" ? (
        <DownloadPanel />
      ) : view === "library" ? (
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
                ref={searchRef}
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
              <option value="folder">Ordner</option>
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
                groupByFolder={sortKey === "folder"}
                onSelect={onSelect}
                onAdd={onAdd}
                onToggle={onToggle}
                onPreview={onPreview}
              />
            </main>

            {/* Sticky-Sidebar mit EIGENEM Scrollbereich: Inspector + Set sind oft
                höher als der Viewport — ohne max-h/overflow wäre alles unterhalb
                der Bildschirmkante unerreichbar. Ist der MiniPlayer offen, endet
                der Bereich über ihm (8rem ≈ top-Offset + Player-Höhe). */}
            <aside
              className={`flex flex-col gap-6 self-start lg:sticky lg:top-6 lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-width:thin] ${
                previewTrack ? "lg:max-h-[calc(100dvh-8rem)]" : "lg:max-h-[calc(100dvh-3rem)]"
              }`}
            >
              <Inspector
                track={selectedTrack}
                tags={selectedTrack ? getTags(state, selectedTrack.id) : { energy: null, phase: null, vibe: [] }}
                inSet={selectedTrack ? setIds.has(selectedTrack.id) : false}
                onPreview={onPreview}
              />
              <SetPanel state={state} trackById={trackById} onSelect={onSelect} />
            </aside>
          </div>
        </>
      ) : view === "timeline" ? (
        <div className="view-fade mt-7 flex flex-col gap-6">
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
              onPreview={onPreview}
            />
          </div>
        </div>
      ) : view === "canvas" ? (
        <div className="view-fade mt-7 flex flex-col gap-6">
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
              onPreview={onPreview}
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

      <Toaster />
      {previewTrack && (
        <Suspense fallback={null}>
          <MiniPlayer track={previewTrack} onClose={() => setPreviewId(null)} />
        </Suspense>
      )}
      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
      {showLibrary && <LibraryManager onClose={() => setShowLibrary(false)} />}
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

function HeaderIconBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-raise hover:text-ink active:translate-y-[1px] disabled:opacity-30 disabled:hover:bg-transparent"
    >
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
