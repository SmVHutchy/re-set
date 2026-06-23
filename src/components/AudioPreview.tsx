import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { Play, Pause } from "@phosphor-icons/react";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

// Isolierte Leaf-Komponente: jede WaveSurfer-Instanz lebt und stirbt mit ihrem src.
export function AudioPreview({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    setReady(false);
    setPlaying(false);
    const ws = WaveSurfer.create({
      container: containerRef.current,
      height: 44,
      waveColor: cssVar("--color-ink-faint"),
      progressColor: cssVar("--color-accent"),
      cursorColor: cssVar("--color-accent"),
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      url: src,
    });
    wsRef.current = ws;
    ws.on("ready", () => setReady(true));
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

  return (
    <div className="mt-3 flex items-center gap-2 rounded-md border border-line bg-base p-2">
      <button
        onClick={() => wsRef.current?.playPause()}
        disabled={!ready}
        aria-label={playing ? "Pause" : "Abspielen"}
        className="flex h-9 w-9 flex-none items-center justify-center rounded-md border transition-colors active:translate-y-[1px] disabled:opacity-40"
        style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
      >
        {playing ? <Pause size={15} weight="fill" /> : <Play size={15} weight="fill" />}
      </button>
      <div ref={containerRef} className="min-w-0 flex-1" />
    </div>
  );
}
