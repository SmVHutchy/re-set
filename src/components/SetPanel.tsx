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
import { useState, type DragEvent } from "react";
import { tracklistText, m3u, m3uPerPhase, nmlPlaylists, nmlSinglePlaylist } from "../lib/export";
import { autoSet } from "../lib/autoset";
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
  Sparkle,
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
  // Highlight, während eine Library-Kachel über dem Panel schwebt.
  const [dropActive, setDropActive] = useState(false);

  const DRAG_TYPE = "application/x-reset-track";

  // Eine aus der Library gezogene Kachel ins aktive Set aufnehmen.
  const onExternalDrop = (e: DragEvent) => {
    const id = e.dataTransfer.getData(DRAG_TYPE);
    setDropActive(false);
    if (!id) return; // interner Reorder-Drop → hier nichts tun
    e.preventDefault();
    dispatch({ type: "addToSet", trackId: id });
    toast("Ins Set");
  };

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

  const safeName = (s: string) => (s || "set").replace(/[^\w\-]+/g, "_");

  const downloadFile = (content: string, name: string, mime = "audio/x-mpegurl") => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Ein M3U, geordnet pre → mid → peak → late (der Set-Bogen als eine Playlist).
  const downloadM3u = () => {
    downloadFile(m3u(items, state), `${safeName(set.name)}.m3u`);
    toast(".m3u exportiert (nach Phase geordnet)");
  };

  // Ein M3U pro Phase → in Traktor getrennte, farb-sortierte Playlists.
  const downloadPerPhase = () => {
    const files = m3uPerPhase(items, state);
    if (!files.length) return;
    files.forEach((f, i) =>
      // leicht versetzt auslösen, damit der Browser die Mehrfach-Downloads zulässt
      setTimeout(() => downloadFile(f.content, `${safeName(set.name)} – ${f.label}.m3u`), i * 150),
    );
    toast(`${files.length} Phasen-Playlists exportiert`);
  };

  // Traktor-NML, EINE Playlist (pre→late geordnet) — funktioniert mit dem
  // normalen Rechtsklick → „Playlist importieren".
  const downloadNml = () => {
    const { content, skipped, tracks } = nmlSinglePlaylist(items, state, set.name);
    downloadFile(content, `${safeName(set.name)}.nml`, "application/xml");
    toast(
      `${tracks} Tracks als eine Playlist exportiert` +
        (skipped > 0 ? ` (${skipped} ohne Pfad übersprungen)` : "") +
        " — Traktor: Rechtsklick → Playlist importieren",
    );
  };

  // Traktor-NML, Ordner mit einer Playlist je Phase — braucht in Traktor
  // zwingend Rechtsklick → „Playlist-ORDNER importieren" (der einfache
  // Playlist-Import nimmt nur eine einzelne Playlist aus der Datei).
  const downloadNmlFolder = () => {
    const { content, skipped, playlists } = nmlPlaylists(items, state, set.name);
    downloadFile(content, `${safeName(set.name)} Phasen.nml`, "application/xml");
    toast(
      `${playlists} Phasen-Playlists exportiert` +
        (skipped > 0 ? ` (${skipped} ohne Pfad übersprungen)` : "") +
        " — Traktor: Rechtsklick → Playlist-ORDNER importieren!",
    );
  };

  // Lokaler Auto-Modus: Phasen + Reihenfolge aus Harmonik/BPM/Genre/Energie.
  const runAutoSet = () => {
    const { order, phases } = autoSet(items, state);
    dispatch({ type: "applyAutoSet", order, phases });
    toast("Auto-Set: Phasen + Reihenfolge gesetzt (Strg+Z = rückgängig)");
  };

  return (
    <section
      className="rounded-lg border bg-surface p-4 transition-colors"
      style={{ borderColor: dropActive ? "var(--color-accent)" : "var(--color-line)" }}
      // Externe Library-Kachel: nur reagieren, wenn wirklich ein Track gezogen
      // wird (interner Reorder setzt diesen Typ nicht → stört das Panel nicht).
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!dropActive) setDropActive(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDropActive(false);
      }}
      onDrop={onExternalDrop}
    >
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
          Noch leer. Kacheln hierher ziehen oder über{" "}
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
                    if (dragIdx === null) return; // externer Drag → Section übernimmt
                    e.preventDefault();
                    if (overIdx !== i) setOverIdx(i);
                  }}
                  onDrop={(e) => {
                    if (dragIdx === null) return; // externen Drop die Section erledigen lassen
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
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
          <button
            onClick={copyList}
            className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[12px] text-ink-soft transition-colors hover:text-ink active:translate-y-[1px]"
          >
            <ClipboardText size={13} weight="regular" /> {copied ? "kopiert ✓" : "Tracklist kopieren"}
          </button>
          <button
            onClick={downloadM3u}
            title="Ein .m3u, geordnet pre → mid → peak → late"
            className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[12px] text-ink-soft transition-colors hover:text-ink active:translate-y-[1px]"
          >
            <DownloadSimple size={13} weight="regular" /> .m3u
          </button>
          <button
            onClick={downloadPerPhase}
            title="Ein .m3u pro Phase → getrennte Playlists in Traktor"
            className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[12px] text-ink-soft transition-colors hover:text-ink active:translate-y-[1px]"
          >
            <DownloadSimple size={13} weight="regular" /> pro Phase
          </button>
          <button
            onClick={downloadNml}
            title="Eine Traktor-Playlist, pre → late geordnet — in Traktor: Rechtsklick → Playlist importieren"
            className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[12px] text-ink-soft transition-colors hover:text-ink active:translate-y-[1px]"
          >
            <DownloadSimple size={13} weight="regular" /> .nml
          </button>
          <button
            onClick={downloadNmlFolder}
            title="Ordner mit Playlists je Phase (Name pre/mid/peak/late) — in Traktor: Rechtsklick → Playlist-ORDNER importieren"
            className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[12px] text-ink-soft transition-colors hover:text-ink active:translate-y-[1px]"
          >
            <DownloadSimple size={13} weight="regular" /> .nml Phasen
          </button>
          {items.length >= 2 && (
            <button
              onClick={runAutoSet}
              title="Auto-Modus: Phasen + Reihenfolge automatisch aus Harmonik, BPM, Genre und Energie"
              className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[12px] font-medium text-sig transition-colors hover:text-ink active:translate-y-[1px]"
            >
              <Sparkle size={13} weight="fill" /> Auto
            </button>
          )}
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
