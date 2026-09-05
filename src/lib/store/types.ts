import type { Phase } from "../tags";

export interface TrackTags {
  energy: number | null; // 1–10
  phase: Phase | null;
  vibe: string[];
}

export interface CanvasPos {
  x: number;
  y: number;
}

export interface DJSet {
  id: string;
  name: string;
  trackIds: string[];
  positions?: Record<string, CanvasPos>; // Set-Canvas Kartenpositionen
}

export type CrateField = "phase" | "energy" | "bpm" | "key" | "genre" | "vibe" | "text";
export type CrateOp = "is" | "gte" | "lte" | "contains" | "has";

export interface CrateRule {
  field: CrateField;
  op: CrateOp;
  value: string;
}

export interface SmartCrate {
  id: string;
  name: string;
  rules: CrateRule[];
}

export interface PersistState {
  tags: Record<string, TrackTags>;
  sets: DJSet[];
  activeSetId: string | null;
  smartCrates: SmartCrate[];
  // Beim Sichten aussortiert. Muss den Reload überleben, sonst beginnt der
  // Fortschritt ("118 von 304") bei jedem Neuladen von vorn — und bei 304
  // Entscheidungen je Ordner ist genau dieser Zähler das, was die Arbeit
  // erträglich macht.
  dismissed: Record<string, true>;
}

export const EMPTY_TAGS: TrackTags = { energy: null, phase: null, vibe: [] };

export function isTagged(t: TrackTags): boolean {
  return t.energy != null || t.phase != null || t.vibe.length > 0;
}
