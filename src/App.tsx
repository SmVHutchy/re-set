import { useEffect, useMemo, useState } from "react";
import { parseNml, type Track } from "./lib/nml";
import { demoTags, PHASES, PHASE_COLOR, type Phase } from "./lib/tags";
import { CoverWall } from "./components/CoverWall";
import { Waveform } from "@phosphor-icons/react";

type Filter = Phase | "all";

export function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

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

  const shown = useMemo(() => {
    if (filter === "all") return tracks;
    return tracks.filter((t) => demoTags(t.id).phase === filter);
  }, [tracks, filter]);

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-[1400px] px-4 py-7 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="flex items-center gap-2 text-[18px] font-medium tracking-tight text-ink">
          <Waveform size={20} weight="regular" className="text-accent" />
          SetForge
        </h1>
        <span className="text-[13px] text-ink-faint">
          Cover-Wall · AP0-Prototyp
        </span>
        {!loading && !error && (
          <span className="ml-auto font-mono text-[12px] text-ink-soft">
            {tracks.length} Tracks · {new Set(tracks.map((t) => t.keyCamelot).filter(Boolean)).size} Keys
          </span>
        )}
      </header>

      <nav className="mt-6 flex flex-wrap items-center gap-2">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          alle
        </FilterChip>
        {PHASES.map((p) => (
          <FilterChip
            key={p}
            active={filter === p}
            color={PHASE_COLOR[p]}
            onClick={() => setFilter(p)}
          >
            {p}
          </FilterChip>
        ))}
      </nav>

      <main className="mt-7">
        <CoverWall tracks={shown} loading={loading} error={error} />
      </main>

      <footer className="mt-12 border-t border-line pt-4 text-[11px] text-ink-faint">
        Phasen/Energie sind hier deterministische Demo-Werte, bis echtes Tagging steht
        (PFLICHTENHEFT FA-6). Key &amp; BPM kommen real aus der collection.nml.
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
      {color && (
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: color }}
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
