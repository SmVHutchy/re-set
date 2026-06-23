import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import type { Track } from "../lib/nml";
import { Play, Pause, X } from "@phosphor-icons/react";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

// Persistenter Mini-Player: läuft weiter, während man durch die Library blättert.
export function MiniPlayer({ track, onClose }: { track: Track | null; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const src = track?.audioPath ?? null;

  useEffect(() => {
    if (!containerRef.current || !src) return;
    setReady(false);
    setPlaying(false);
    const ws = WaveSurfer.create({
      container: containerRef.current,
      height: 36,
      waveColor: cssVar("--color-ink-faint"),
      progressColor: cssVar("--color-accent"),
      cursorColor: cssVar("--color-accent"),
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      url: src,
    });
    wsRef.current = ws;
    ws.on("ready", () => {
      setReady(true);
      ws.play();
    });
    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => setPlaying(false));
    return () => {
      try {
        ws.destroy();
      } catch {
        // destroy während des Ladens kann harmlos werfen
      }
      wsRef.current = null;
    };
  }, [src]);

  if (!track) return null;

  return (
    <div
      className="border-t border-line bg-surface px-4 py-2"
      style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50 }}
    >
      <div className="mx-auto flex max-w-[1400px] items-center gap-3">
        {track.coverPath && (
          <img src={track.coverPath} alt="" className="h-9 w-9 flex-none rounded object-cover" />
        )}
        <div className="w-40 flex-none">
          <div className="truncate text-[12px] font-medium text-ink">{track.title}</div>
          <div className="truncate text-[11px] text-ink-soft">{track.artist}</div>
        </div>
        <button
          onClick={() => wsRef.current?.playPause()}
          disabled={!ready}
          aria-label={playing ? "Pause" : "Abspielen"}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-md border transition-colors active:translate-y-[1px] disabled:opacity-40"
          style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
        >
          {playing ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
        </button>
        <div ref={containerRef} className="min-w-0 flex-1" />
        <button
          onClick={onClose}
          aria-label="Player schließen"
          className="flex h-7 w-7 flex-none items-center justify-center rounded text-ink-faint hover:text-ink"
        >
          <X size={14} weight="bold" />
        </button>
      </div>
    </div>
  );
}
