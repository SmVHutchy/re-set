import { useState } from "react";
import type { Track } from "../lib/nml";
import type { TrackTags } from "../lib/store/types";
import { useStore } from "../lib/store/StoreProvider";
import { PHASES, PHASE_COLOR, VIBE_SUGGESTIONS } from "../lib/tags";
import { grade, flags, GRADE_COLOR, FLAG_LABEL } from "../lib/quality";
import { Plus, Check, X, SlidersHorizontal, Play } from "@phosphor-icons/react";

interface Props {
  track: Track | null;
  tags: TrackTags;
  inSet: boolean;
  onPreview: (id: string) => void;
}

export function Inspector({ track, tags, inSet, onPreview }: Props) {
  const { dispatch } = useStore();
  const [vibeInput, setVibeInput] = useState("");

  if (!track) {
    return (
      <section className="rounded-lg border border-dashed border-line-strong px-4 py-10 text-center">
        <SlidersHorizontal size={22} className="mx-auto text-ink-faint" weight="regular" />
        <p className="mt-2 text-[13px] text-ink-soft">
          Wähle einen Track, um Energie, Phase und Vibe zu taggen.
        </p>
      </section>
    );
  }

  const addVibe = (raw: string) => {
    const v = raw.trim();
    if (v) dispatch({ type: "addVibe", id: track.id, vibe: v });
    setVibeInput("");
  };

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="min-w-0">
        <div className="truncate text-[14px] font-medium text-ink">{track.title}</div>
        <div className="truncate text-[12px] text-ink-soft">{track.artist}</div>
        <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-ink-faint">
          {track.keyCamelot && <span className="text-accent">{track.keyCamelot}</span>}
          {track.bpm != null && <span>{track.bpm.toFixed(1)} BPM</span>}
          {track.genre && <span className="truncate">· {track.genre}</span>}
        </div>
        {(track.bitrate != null || track.lossless || track.lufs != null) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-ink-faint">
            <span style={{ color: GRADE_COLOR[grade(track)] }}>
              {track.lossless ? "lossless" : track.bitrate != null ? `${track.bitrate} kbps` : "—"}
            </span>
            {track.lufs != null && <span>· {track.lufs} LUFS</span>}
            {track.truePeak != null && <span>· peak {track.truePeak}</span>}
            {flags(track).map((f) => (
              <span key={f} style={{ color: "var(--color-accent)" }}>
                {FLAG_LABEL[f]}
              </span>
            ))}
          </div>
        )}
      </div>

      {track.audioPath && (
        <button
          onClick={() => onPreview(track.id)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-line py-2 text-[13px] text-ink-soft transition-colors hover:text-ink active:translate-y-[1px]"
        >
          <Play size={14} weight="fill" /> Vorhören
        </button>
      )}

      <Field label="Energie">
        <div className="flex gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
            const active = tags.energy != null && n <= tags.energy;
            return (
              <button
                key={n}
                aria-label={`Energie ${n}`}
                onClick={() =>
                  dispatch({
                    type: "setEnergy",
                    id: track.id,
                    energy: tags.energy === n ? null : n,
                  })
                }
                className="h-6 flex-1 rounded-[4px] border transition-colors active:translate-y-[1px]"
                style={{
                  borderColor: active ? "var(--color-accent)" : "var(--color-line)",
                  background: active ? "var(--color-accent-soft)" : "transparent",
                }}
              />
            );
          })}
        </div>
        <div className="mt-1 text-right font-mono text-[11px] text-ink-faint">
          {tags.energy != null ? `E${tags.energy} / 10` : "nicht gesetzt"}
        </div>
      </Field>

      <Field label="Phase">
        <div className="grid grid-cols-4 gap-1.5">
          {PHASES.map((p) => {
            const active = tags.phase === p;
            return (
              <button
                key={p}
                onClick={() =>
                  dispatch({ type: "setPhase", id: track.id, phase: active ? null : p })
                }
                className="flex items-center justify-center gap-1 rounded-md border py-1.5 text-[12px] font-medium transition-colors active:translate-y-[1px]"
                style={{
                  borderColor: active ? "var(--color-line-strong)" : "var(--color-line)",
                  background: active ? "var(--color-raise)" : "transparent",
                  color: active ? "var(--color-ink)" : "var(--color-ink-soft)",
                }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: PHASE_COLOR[p] }}
                  aria-hidden="true"
                />
                {p}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Vibe">
        <div className="flex flex-wrap gap-1.5">
          {tags.vibe.map((v) => (
            <span
              key={v}
              className="flex items-center gap-1 rounded-md border border-line bg-raise px-2 py-0.5 text-[12px] text-ink"
            >
              {v}
              <button
                aria-label={`${v} entfernen`}
                onClick={() => dispatch({ type: "removeVibe", id: track.id, vibe: v })}
                className="text-ink-faint hover:text-accent"
              >
                <X size={11} weight="bold" />
              </button>
            </span>
          ))}
        </div>
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            addVibe(vibeInput);
          }}
        >
          <input
            value={vibeInput}
            onChange={(e) => setVibeInput(e.target.value)}
            placeholder="Vibe hinzufügen…"
            className="h-8 flex-1 rounded-md border border-line bg-base px-2 text-[12px] text-ink outline-none placeholder:text-ink-faint focus:border-line-strong"
          />
        </form>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {VIBE_SUGGESTIONS.filter((s) => !tags.vibe.includes(s)).map((s) => (
            <button
              key={s}
              onClick={() => addVibe(s)}
              className="rounded-md px-1.5 py-0.5 text-[11px] text-ink-faint hover:text-ink-soft"
            >
              + {s}
            </button>
          ))}
        </div>
      </Field>

      <button
        onClick={() => dispatch({ type: "addToSet", trackId: track.id })}
        disabled={inSet}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-md border py-2 text-[13px] font-medium transition-colors active:translate-y-[1px] disabled:cursor-default"
        style={{
          borderColor: inSet ? "var(--color-sig)" : "var(--color-accent)",
          background: inSet ? "transparent" : "var(--color-accent)",
          color: inSet ? "var(--color-sig)" : "var(--color-on-accent)",
        }}
      >
        {inSet ? <Check size={14} weight="bold" /> : <Plus size={14} weight="bold" />}
        {inSet ? "Im Set" : "Zum Set hinzufügen"}
      </button>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </div>
      {children}
    </div>
  );
}
