import { useState } from "react";
import { useStore } from "../lib/store/StoreProvider";
import { PHASES, PHASE_COLOR } from "../lib/tags";
import { Plus, X, Check } from "@phosphor-icons/react";

interface Props {
  ids: string[];
  visibleCount: number;
  onSelectAllVisible: () => void;
  onClear: () => void;
}

export function BatchBar({ ids, visibleCount, onSelectAllVisible, onClear }: Props) {
  const { dispatch } = useStore();
  const [vibe, setVibe] = useState("");
  const disabled = ids.length === 0;

  return (
    <div className="mb-4 rounded-lg border border-line bg-raise p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[13px] font-medium text-ink">
          {ids.length > 0 ? `${ids.length} gewählt` : "Mehrfachauswahl"}
        </span>

        <Group label="Phase">
          {PHASES.map((p) => (
            <button
              key={p}
              disabled={disabled}
              onClick={() => dispatch({ type: "batchSetPhase", ids, phase: p })}
              className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[12px] text-ink-soft transition-colors hover:text-ink active:translate-y-[1px] disabled:opacity-40"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: PHASE_COLOR[p] }} />
              {p}
            </button>
          ))}
        </Group>

        <Group label="Energie">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              disabled={disabled}
              aria-label={`Energie ${n}`}
              onClick={() => dispatch({ type: "batchSetEnergy", ids, energy: n })}
              className="h-6 w-5 rounded-[4px] border border-line text-[10px] text-ink-faint transition-colors hover:border-line-strong hover:text-ink-soft active:translate-y-[1px] disabled:opacity-40"
            >
              {n}
            </button>
          ))}
        </Group>

        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!disabled && vibe.trim()) dispatch({ type: "batchAddVibe", ids, vibe });
            setVibe("");
          }}
        >
          <input
            value={vibe}
            onChange={(e) => setVibe(e.target.value)}
            placeholder="Vibe…"
            disabled={disabled}
            className="h-7 w-24 rounded-md border border-line bg-base px-2 text-[12px] text-ink outline-none placeholder:text-ink-faint focus:border-line-strong disabled:opacity-40"
          />
        </form>

        <div className="ml-auto flex items-center gap-2">
          <button
            disabled={disabled}
            onClick={() => dispatch({ type: "batchAddToSet", ids })}
            className="flex items-center gap-1 rounded-md border px-2 py-1 text-[12px] font-medium transition-colors active:translate-y-[1px] disabled:opacity-40"
            style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
          >
            <Plus size={12} weight="bold" /> Set
          </button>
          <button
            onClick={onSelectAllVisible}
            className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[12px] text-ink-soft transition-colors hover:text-ink active:translate-y-[1px]"
          >
            <Check size={12} weight="bold" /> alle {visibleCount}
          </button>
          <button
            disabled={disabled}
            onClick={onClear}
            className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[12px] text-ink-soft transition-colors hover:text-ink active:translate-y-[1px] disabled:opacity-40"
          >
            <X size={12} weight="bold" /> leeren
          </button>
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-ink-faint">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}
