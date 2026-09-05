import type { CuePoint } from "../nml";
import type { FieldChange, SyncField, TrackDiff, TrackState } from "./adapter";

/**
 * Der letzte bekannte Stand je Ziel. Ohne ihn lässt sich nicht unterscheiden,
 * ob ein Feld sich geändert hat oder auf einer Seite nie existierte — und genau
 * diese Unterscheidung ist der Unterschied zwischen „Änderung erkennen" und
 * „blind überschreiben".
 */
export interface Snapshot {
  adapter: string;
  takenAt: number;
  tracks: TrackState[];
}

const KEY_PREFIX = "reset.sync.snapshot.";

export function loadSnapshot(adapter: string): Snapshot | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + adapter);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null; // kaputt oder nicht verfügbar → als „kein Stand" behandeln
  }
}

export function saveSnapshot(snap: Snapshot): void {
  try {
    localStorage.setItem(KEY_PREFIX + snap.adapter, JSON.stringify(snap));
  } catch {
    // Speicher voll oder blockiert — der Abgleich funktioniert dann nur nicht
    // inkrementell; das ist kein Grund, die App scheitern zu lassen.
  }
}

export function clearSnapshot(adapter: string): void {
  try {
    localStorage.removeItem(KEY_PREFIX + adapter);
  } catch {
    // s. o.
  }
}

// --- Vergleich ---------------------------------------------------------------

const fmt = (v: unknown): string => (v == null ? "—" : String(v));

/** Cues vergleichbar machen: Slot, Position (auf 10 ms) und Länge. */
function cueSignature(cues: CuePoint[]): string {
  return cues
    .map((c) => `${c.slot ?? "-"}@${Math.round(c.startMs / 10)}${c.lengthMs ? `+${Math.round(c.lengthMs)}` : ""}`)
    .sort()
    .join(" ");
}

// Positionen auf 10 ms runden: Traktor schreibt Fließkommawerte, und ein
// Unterschied in der zwölften Nachkommastelle ist keine Änderung, die jemanden
// interessiert. 10 ms liegen weit unter allem, was hörbar wäre.
function gridSignature(anchors: number[]): string {
  return anchors.map((a) => Math.round(a / 10)).sort((a, b) => a - b).join(" ");
}

function fieldValues(t: TrackState): Record<SyncField, string> {
  return {
    bpm: t.bpm == null ? "—" : t.bpm.toFixed(2),
    key: fmt(t.keyCamelot),
    rating: fmt(t.rating),
    playcount: fmt(t.playcount),
    hotcues: cueSignature(t.hotcues),
    loops: cueSignature(t.loops),
    beatgrid: gridSignature(t.gridAnchorsMs),
    playlists: [...t.playlists].sort().join(" · "),
    comment: "",
  };
}

/** Welche Felder unterscheiden sich zwischen zwei Ständen desselben Tracks? */
export function changedFields(
  a: TrackState,
  b: TrackState,
  fields: Iterable<SyncField>,
): FieldChange[] {
  const va = fieldValues(a);
  const vb = fieldValues(b);
  const out: FieldChange[] = [];
  for (const f of fields) {
    if (va[f] !== vb[f]) out.push({ field: f, before: va[f], after: vb[f] });
  }
  return out;
}

/**
 * Zwei-Wege-Vergleich: was hat sich von `reference` nach `current` geändert?
 */
export function diffStates(
  reference: TrackState[],
  current: TrackState[],
  fields: Iterable<SyncField>,
): TrackDiff[] {
  const fieldList = [...fields];
  const before = new Map(reference.map((t) => [t.id, t]));
  const out: TrackDiff[] = [];

  for (const t of current) {
    const prev = before.get(t.id);
    if (!prev) {
      out.push({ id: t.id, title: t.title, artist: t.artist, status: "added", changes: [] });
      continue;
    }
    before.delete(t.id);
    const changes = changedFields(prev, t, fieldList);
    if (changes.length) {
      out.push({ id: t.id, title: t.title, artist: t.artist, status: "changed", changes });
    }
  }

  for (const gone of before.values()) {
    out.push({
      id: gone.id,
      title: gone.title,
      artist: gone.artist,
      status: "removed",
      changes: [],
    });
  }

  return out;
}

/**
 * Drei-Wege-Vergleich: ein Konflikt liegt vor, wenn dasselbe Feld sich seit dem
 * gemeinsamen Stand auf *beiden* Seiten geändert hat — und zwar unterschiedlich.
 * Nur dann muss jemand entscheiden; alles andere lässt sich eindeutig zuordnen.
 */
export function findConflicts(
  base: TrackState[],
  mine: TrackState[],
  theirs: TrackState[],
  fields: Iterable<SyncField>,
): TrackDiff[] {
  const fieldList = [...fields];
  const baseById = new Map(base.map((t) => [t.id, t]));
  const theirsById = new Map(theirs.map((t) => [t.id, t]));
  const out: TrackDiff[] = [];

  for (const m of mine) {
    const b = baseById.get(m.id);
    const t = theirsById.get(m.id);
    if (!b || !t) continue; // ohne gemeinsamen Stand gibt es nichts zu versöhnen

    const mineChanged = new Map(changedFields(b, m, fieldList).map((c) => [c.field, c]));
    const theirsChanged = new Map(changedFields(b, t, fieldList).map((c) => [c.field, c]));

    const changes: FieldChange[] = [];
    for (const [field, mc] of mineChanged) {
      const tc = theirsChanged.get(field);
      if (tc && tc.after !== mc.after) {
        changes.push({ field, before: mc.after, after: tc.after });
      }
    }
    if (changes.length) {
      out.push({ id: m.id, title: m.title, artist: m.artist, status: "changed", changes });
    }
  }

  return out;
}
