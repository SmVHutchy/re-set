import type { Phase } from "../tags";

export interface TrackTags {
  energy: number | null; // 1–10
  phase: Phase | null;
  vibe: string[];
}

export interface DJSet {
  id: string;
  name: string;
  trackIds: string[];
}

export interface PersistState {
  tags: Record<string, TrackTags>;
  sets: DJSet[];
  activeSetId: string | null;
}

export const EMPTY_TAGS: TrackTags = { energy: null, phase: null, vibe: [] };

export function isTagged(t: TrackTags): boolean {
  return t.energy != null || t.phase != null || t.vibe.length > 0;
}
