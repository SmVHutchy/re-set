import type { CuePoint, Track } from "../nml";

/**
 * Felder, die zwischen DJ-Programmen abgeglichen werden können. Nicht jedes
 * Ziel kann jedes Feld — deshalb meldet jeder Adapter, was er beherrscht,
 * statt dass die Engine es annimmt.
 */
export type SyncField =
  | "bpm"
  | "key"
  | "rating"
  | "playcount"
  | "hotcues"
  | "loops"
  | "beatgrid"
  | "playlists"
  | "comment";

export const FIELD_LABEL: Record<SyncField, string> = {
  bpm: "BPM",
  key: "Tonart",
  rating: "Bewertung",
  playcount: "Abspielzähler",
  hotcues: "Hotcues",
  loops: "Loops",
  beatgrid: "Beatgrid",
  playlists: "Playlists",
  comment: "Kommentar",
};

/**
 * Der Zustand eines Tracks, wie ein Ziel ihn sieht — die gemeinsame Sprache
 * zwischen den Adaptern.
 *
 * `gridAnchorsMs` ist bewusst eine Liste, kein einzelner Wert. Die naheliegende
 * Annahme wäre „Traktor hat genau einen Anker, Rekordbox mehrere" — sie ist
 * falsch: in einer echten Collection tragen zwei von 588 Tracks fünf bzw. sechs
 * Grid-Marker (manuell korrigierte Raster). Ein Interface, das hier eine Zahl
 * statt einer Liste führte, würde beim ersten solchen Track Daten verlieren.
 */
export interface TrackState {
  id: string;
  title: string;
  artist: string;
  bpm: number | null;
  keyCamelot: string | null;
  rating: number | null;
  playcount: number | null;
  hotcues: CuePoint[];
  loops: CuePoint[];
  gridAnchorsMs: number[];
  playlists: string[];
}

export interface FieldChange {
  field: SyncField;
  before: string;
  after: string;
}

export type DiffStatus = "added" | "removed" | "changed";

export interface TrackDiff {
  id: string;
  title: string;
  artist: string;
  status: DiffStatus;
  changes: FieldChange[];
}

export interface DryRun {
  adapter: string;
  diffs: TrackDiff[];
  /** Felder, die auf beiden Seiten seit dem letzten Abgleich abweichen. */
  conflicts: TrackDiff[];
}

export interface SyncAdapter {
  id: string;
  label: string;
  /** Was dieses Ziel überhaupt abgleichen kann. */
  capabilities: ReadonlySet<SyncField>;
  /** Aktuellen Stand lesen. */
  read(): TrackState[];
  /**
   * Vergleicht den gelesenen Stand mit einem Referenzstand und beschreibt, was
   * sich unterscheidet. Schreibt nie.
   */
  plan(reference: TrackState[]): DryRun;
  /**
   * Wendet einen Dry-Run an. Solange der Write-Back nach Traktor nicht gebaut
   * ist (AP-C), meldet das jeder Adapter ehrlich als nicht unterstützt, statt
   * still nichts zu tun.
   */
  apply(dryRun: DryRun): Promise<{ written: number }>;
}

/** Track aus der Library in den adapterneutralen Zustand übersetzen. */
export function toTrackState(t: Track): TrackState {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    bpm: t.bpm,
    keyCamelot: t.keyCamelot,
    rating: t.rating,
    playcount: t.playcount,
    hotcues: t.cues.filter((c) => c.kind === "hotcue"),
    loops: t.cues.filter((c) => c.kind === "loop"),
    gridAnchorsMs: t.cues.filter((c) => c.kind === "grid").map((c) => c.startMs),
    playlists: t.playlists,
  };
}
