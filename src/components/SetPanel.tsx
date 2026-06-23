import type { Track } from "../lib/nml";
import type { PersistState } from "../lib/store/types";
import { EMPTY_TAGS } from "../lib/store/types";
import { useStore, activeSet } from "../lib/store/StoreProvider";
import {
  compatibility,
  COMPAT_COLOR,
  COMPAT_LABEL,
  COMPAT_DASH,
} from "../lib/compat";
import { PHASE_COLOR } from "../lib/tags";
import { useState } from "react";
import { tracklistText, m3u } from "../lib/export";
import { toast } from "../lib/toast";
import {
  CaretUp,
  CaretDown,
  X,
  Plus,
  Stack,
  CopySimple,
  Trash,
  DotsSixVertical,
  DownloadSimple,
  ClipboardText,
} from "@phosphor-icons/react";

interface Props {
  state: PersistState;
  trackById: Map<string, Track>;
  onSelect: (id: string) => void;
}

export function SetPanel({ state, trackById, onSelect }: Props) {
  const { dispatch } = useStore();
  const set = activeSet(state);
  const items = set.trackIds
    .map((id) => trackById.get(id))
    .filter((t): t is Track => Boolean(t));
  const totalSec = items.reduce((n, t) => n + (t.durationS ?? 0), 0);

  const onDelete = () => {
    if (items.length === 0 || confirm(`Set „${set.name}" löschen?`)) {
      dispatch({ type: "deleteSet" });
    }
  };

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const onDrop = (to: number) => {
    if (dragIdx !== null && dragIdx !== to) dispatch({ type: "reorderInSet", from: dragIdx, to });
    setDragIdx(null);
    setOverIdx(null);
  };

  const copyList = async () => {
    try {
      await navigator.clipboard.writeText(tracklistText(items, state));
      setCopied(true);
      toast("Tracklist kopiert");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Clipboard nicht verfügbar */
    }
  };

  const downloadM3u = () => {
    const blob = new Blob([m3u(items)], { type: "audio/x-mpegurl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${set.name || "set"}.m3u`;
    a.click();
    URL.revokeObjectURL(url);
    toast(".m3u exportiert");
  };

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <Stack size={16} weight="regular" className="text-ink-soft" />
        <input
          value={set.name}
          onChange={(e) => dispatch({ type: "renameSet", name: e.target.value })}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[14px] font-medium text-ink outline-none hover:border-line focus:border-line-strong"
        />
        <IconBtn label="Neues Set" onClick={() => dispatch({ type: "newSet" })}>
          <Plus size={13} weight="bold" />
        </IconBtn>
        <IconBtn label="Set duplizieren" onClick={() => dispatch({ type: "duplicateSet" })}>
          <CopySimple size={13} weight="bold" />
        </IconBtn>
        <IconBtn label="Set löschen" onClick={onDelete}>
          <Trash size={13} weight="bold" />
        </IconBtn>
      </div>

      {state.sets.length > 1 && (
        <select
          value={state.activeSetId ?? ""}
          onChange={(e) => dispatch({ type: "selectSet", id: e.target.value })}
          className="mt-2 w-full rounded-md border border-line bg-base px-2 py-1.5 text-[12px] text-ink outline-none focus:border-line-strong"
        >
          {state.sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.trackIds.length})
            </option>
          ))}
        </select>
      )}

      <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-ink-faint">
        <span>{items.length} Tracks</span>
        <span>{fmtDuration(totalSec)}</span>
      </div>

      {items.length === 0 ? (
        <p className="mt-6 mb-2 text-center text-[13px] text-ink-soft">
          Noch leer. Tracks über{" "}
          <span className="inline-flex h-4 w-4 translate-y-[3px] items-center justify-center rounded border border-line">
            <Plus size={10} weight="bold" />
          </span>{" "}
          hinzufügen.
        </p>
      ) : (
        <ol className="mt-3">
          {items.map((t, i) => {
            const tags = state.tags[t.id] ?? EMPTY_TAGS;
            const prev = i > 0 ? items[i - 1] : null;
            const link = prev
              ? compatibility(
                  prev,
                  t,
                  state.tags[prev.id] ?? EMPTY_TAGS,
                  tags,
                )
              : null;
            return (
              <li key={`${t.id}-${i}`}>
                {link && (
                  <div className="flex items-center gap-2 py-1 pl-1">
                    <span
                      className="ml-[5px] h-4 border-l"
                      style={{
                        borderColor: COMPAT_COLOR[link.level],
                        borderLeftStyle: COMPAT_DASH[link.level] as "solid",
                      }}
                    />
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: COMPAT_COLOR[link.level] }}
                    >
                      {COMPAT_LABEL[link.level]}
                    </span>
                  </div>
                )}
                <div
                  className="group flex items-center gap-1.5 border-t-2 border-transparent"
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (overIdx !== i) setOverIdx(i);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    onDrop(i);
                  }}
                  onDragEnd={() => {
                    setDragIdx(null);
                    setOverIdx(null);
                  }}
                  style={{
                    opacity: dragIdx === i ? 0.4 : 1,
                    borderTopColor:
                      overIdx === i && dragIdx !== null && dragIdx !== i
                        ? "var(--color-accent)"
                        : "transparent",
                  }}
                >
                  <DotsSixVertical
                    size={13}
                    weight="bold"
                    className="flex-none cursor-grab text-ink-faint group-hover:text-ink-soft"
                  />
                  <button
                    onClick={() => onSelect(t.id)}
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-md border border-line font-mono text-[11px]"
                    style={{
                      background: tags.phase
                        ? `color-mix(in oklab, ${PHASE_COLOR[tags.phase]} 32%, var(--color-base))`
                        : "var(--color-raise)",
                      color: "var(--color-ink-soft)",
                    }}
                  >
                    {i + 1}
                  </button>
                  <button
                    onClick={() => onSelect(t.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-[12px] font-medium text-ink">{t.title}</div>
                    <div className="truncate font-mono text-[10px] text-ink-faint">
                      {t.keyCamelot ?? "—"} · {t.bpm != null ? t.bpm.toFixed(0) : "—"} ·{" "}
                      {tags.energy != null ? `E${tags.energy}` : "E–"}
                    </div>
                  </button>
                  <div className="flex flex-none items-center opacity-0 transition-opacity group-hover:opacity-100">
                    <IconBtn label="hoch" onClick={() => dispatch({ type: "moveInSet", index: i, dir: -1 })}>
                      <CaretUp size={12} weight="bold" />
                    </IconBtn>
                    <IconBtn label="runter" onClick={() => dispatch({ type: "moveInSet", index: i, dir: 1 })}>
                      <CaretDown size={12} weight="bold" />
                    </IconBtn>
                    <IconBtn label="entfernen" onClick={() => dispatch({ type: "removeFromSet", index: i })}>
                      <X size={12} weight="bold" />
                    </IconBtn>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {items.length > 0 && (
        <div className="mt-3 flex gap-2 border-t border-line pt-3">
          <button
            onClick={copyList}
            className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[12px] text-ink-soft transition-colors hover:text-ink active:translate-y-[1px]"
          >
            <ClipboardText size={13} weight="regular" /> {copied ? "kopiert ✓" : "Tracklist kopieren"}
          </button>
          <button
            onClick={downloadM3u}
            className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[12px] text-ink-soft transition-colors hover:text-ink active:translate-y-[1px]"
          >
            <DownloadSimple size={13} weight="regular" /> .m3u
          </button>
        </div>
      )}
    </section>
  );
}

function fmtDuration(sec: number): string {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m} min`;
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded text-ink-faint hover:text-ink active:translate-y-[1px]"
    >
      {children}
    </button>
  );
}
