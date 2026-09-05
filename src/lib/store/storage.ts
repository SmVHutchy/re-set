import type { PersistState, DJSet } from "./types";

// Persistenz-Schicht hinter einer schmalen API. Aktuell localStorage —
// wird später (Tauri-Shell) gegen SQLite getauscht, ohne dass die App-Logik
// es merkt. Tags/Sets sind klein (Tracks selbst kommen aus der NML).
const KEY = "setforge.state.v1";

export function newId(): string {
  return crypto.randomUUID();
}

function freshSet(name: string): DJSet {
  return { id: newId(), name, trackIds: [] };
}

export function defaultState(): PersistState {
  const set = freshSet("Set 1");
  return { tags: {}, sets: [set], activeSetId: set.id, smartCrates: [], dismissed: {} };
}

function normalize(raw: unknown): PersistState {
  const base = defaultState();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<PersistState>;
  const tags = r.tags && typeof r.tags === "object" ? r.tags : {};
  const sets = Array.isArray(r.sets) && r.sets.length > 0 ? r.sets : base.sets;
  const activeSetId =
    r.activeSetId && sets.some((s) => s.id === r.activeSetId)
      ? r.activeSetId
      : sets[0].id;
  const smartCrates = Array.isArray(r.smartCrates) ? r.smartCrates : [];
  const dismissed =
    r.dismissed && typeof r.dismissed === "object" ? r.dismissed : {};
  return { tags, sets, activeSetId, smartCrates, dismissed };
}

export function loadState(): PersistState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {
    // korrupter/fehlender Speicher → sauberer Default
  }
  return defaultState();
}

export function saveState(state: PersistState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Speicher voll / nicht verfügbar — bewusst still
  }
}
