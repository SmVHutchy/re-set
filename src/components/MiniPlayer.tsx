import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import type { Track } from "../lib/nml";
import { Play, Pause, X } from "@phosphor-icons/react";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

/** Steuerung von außen — das Sichten bedient den Player per Tastatur. */
export interface MiniPlayerHandle {
  toggle(): void;
}

// Persistenter Mini-Player: läuft weiter, während man durch die Library blättert.
export const MiniPlayer = forwardRef<
  MiniPlayerHandle,
  {
    track: Track | null;
    onClose: () => void;
    /**
     * Startposition als Anteil der Spieldauer (0–1). Beim Sichten entscheidet
     * niemand nach dem Intro — der Track soll dort anfangen, wo er zeigt, was
     * er kann. 0 bleibt der normale Anfang.
     */
    startAt?: number;
  }
>(function MiniPlayer({ track, onClose, startAt = 0 }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = track?.audioPath ?? null;

  useEffect(() => {
    if (!containerRef.current || !src) return;
    setReady(false);
    setPlaying(false);
    setFailed(false);
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
      // seekTo vor play, sonst hört man kurz den Anfang und springt dann.
      if (startAt > 0) ws.seekTo(Math.min(0.95, startAt));
      ws.play();
    });
    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => setPlaying(false));
    // Datei nicht erreichbar (404 vom /api/audio, Platte ab, Format) → nicht
    // ewig „Lädt…", sondern klaren Hinweis zeigen.
    ws.on("error", () => {
      setFailed(true);
      setReady(false);
    });
    return () => {
      try {
        ws.destroy();
      } catch {
        // destroy während des Ladens kann harmlos werfen
      }
      wsRef.current = null;
    };
  }, [src, startAt]);

  useImperativeHandle(ref, () => ({
    toggle: () => wsRef.current?.playPause(),
  }));

  if (!track) return null;

  return (
    <div
      className="border-t border-line bg-surface px-4 py-2"
      style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50 }}
    >
      <div className="mx-auto flex max-w-[1400px] items-center gap-3">
        {track.coverPath && (
          <img
            src={track.coverPath}
            alt=""
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            className="h-9 w-9 flex-none rounded object-cover"
          />
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
        <div ref={containerRef} className="min-w-0 flex-1" hidden={failed} />
        {failed && (
          <div className="min-w-0 flex-1 truncate text-[12px] text-ink-faint">
            Datei nicht gefunden — Musik-Ordner unter „Geladene Ordner verwalten" eintragen.
          </div>
        )}
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
});
