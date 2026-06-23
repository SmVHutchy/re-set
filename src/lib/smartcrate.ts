import type { Track } from "./nml";
import type { TrackTags, SmartCrate, CrateRule } from "./store/types";

function matchRule(track: Track, tags: TrackTags, r: CrateRule): boolean {
  const v = r.value.trim().toLowerCase();
  switch (r.field) {
    case "phase":
      return tags.phase === r.value;
    case "energy": {
      if (tags.energy == null) return false;
      const n = Number(r.value);
      return r.op === "lte" ? tags.energy <= n : tags.energy >= n;
    }
    case "bpm": {
      if (track.bpm == null) return false;
      const n = Number(r.value);
      return r.op === "lte" ? track.bpm <= n : track.bpm >= n;
    }
    case "key":
      return (track.keyCamelot ?? "").toUpperCase() === r.value.toUpperCase();
    case "genre":
      return (track.genre ?? "").toLowerCase().includes(v);
    case "vibe":
      return tags.vibe.includes(v);
    case "text":
      return `${track.title} ${track.artist}`.toLowerCase().includes(v);
    default:
      return false;
  }
}

// AND-Semantik: alle Regeln müssen passen.
export function crateMatches(track: Track, tags: TrackTags, crate: SmartCrate): boolean {
  return crate.rules.every((r) => matchRule(track, tags, r));
}
