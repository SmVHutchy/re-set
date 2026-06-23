import type { Track } from "./nml";
import type { PersistState } from "./store/types";
import { EMPTY_TAGS } from "./store/types";

// Lesbare Tracklist zum Teilen/Kopieren.
export function tracklistText(items: Track[], state: PersistState): string {
  return items
    .map((t, i) => {
      const tg = state.tags[t.id] ?? EMPTY_TAGS;
      const meta = [
        t.keyCamelot,
        t.bpm != null ? `${Math.round(t.bpm)} BPM` : null,
        tg.energy != null ? `E${tg.energy}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return `${i + 1}. ${t.artist} – ${t.title}${meta ? `  (${meta})` : ""}`;
    })
    .join("\n");
}

// Standard-M3U mit Dateipfaden (für Re-Import in Traktor/Player).
export function m3u(items: Track[]): string {
  const lines = ["#EXTM3U"];
  for (const t of items) {
    lines.push(`#EXTINF:${t.durationS ?? -1},${t.artist} - ${t.title}`);
    lines.push(t.path ?? t.title);
  }
  return lines.join("\n") + "\n";
}
