import { harmonicScore } from "./camelot";
import type { Track } from "./nml";
import type { TrackTags } from "./store/types";

export type CompatLevel = "ok" | "okay" | "break";

// Tempo: ±6 % = grün, ±12 % = gelb, sonst rot. Half/Double-Time wird erkannt.
function tempoScore(a: number | null, b: number | null): number {
  if (a == null || b == null) return 0.6;
  const cands = [b, b * 2, b / 2];
  let best = Infinity;
  for (const c of cands) best = Math.min(best, Math.abs(a - c) / a);
  if (best <= 0.06) return 1;
  if (best <= 0.12) return 0.5;
  return 0.1;
}

function energyScore(a: number | null, b: number | null): number {
  if (a == null || b == null) return 0.6;
  const d = Math.abs(a - b);
  if (d <= 1) return 1;
  if (d <= 3) return 0.7;
  return 0.4;
}

// Genre-Nähe: Traktor-Genres sind Freitext ("Jungle", "Liquid drum and bass").
// exakt = 1, Wortüberlappung (Sub-Genre-Verwandtschaft) = 0.75, unbekannt = 0.6,
// sonst 0.35. Wichtig für Libraries ohne Key/BPM, wo Genre das einzige Signal ist.
function words(g: string | null): string[] {
  return (g ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
function genreScore(a: string | null, b: string | null): number {
  const wa = words(a);
  const wb = words(b);
  if (!wa.length || !wb.length) return 0.6;
  if (wa.join(" ") === wb.join(" ")) return 1;
  const sa = new Set(wa);
  return wb.some((w) => sa.has(w)) ? 0.75 : 0.35;
}

// Gewichte: Harmonik dominiert, Genre als vierter Faktor (PFLICHTENHEFT §7.1,
// erweitert um Genre). Fehlt ein Signal, degradiert der jeweilige Faktor neutral.
const W = { harm: 0.42, tempo: 0.28, genre: 0.18, energy: 0.12 };

export interface Compatibility {
  score: number;
  level: CompatLevel;
  // Einzelfaktoren (0..1) für Begründungs-Chips in der UI.
  harm: number;
  tempo: number;
  genre: number;
  energy: number;
}

// Gewichteter Score aus Harmonik / Tempo / Genre / Energie.
export function compatibility(
  a: Track,
  b: Track,
  ta: TrackTags,
  tb: TrackTags,
): Compatibility {
  const harm = harmonicScore(a.keyCamelot, b.keyCamelot);
  const tempo = tempoScore(a.bpm, b.bpm);
  const genre = genreScore(a.genre, b.genre);
  const energy = energyScore(ta.energy, tb.energy);
  const score = W.harm * harm + W.tempo * tempo + W.genre * genre + W.energy * energy;
  const level: CompatLevel = score >= 0.72 ? "ok" : score >= 0.5 ? "okay" : "break";
  return { score, level, harm, tempo, genre, energy };
}

// Kurze Begründungs-Chips ("warum passt B zu A?") für Vorschlags-Listen.
export function matchReasons(a: Track, b: Track, ta: TrackTags, tb: TrackTags): string[] {
  const r: string[] = [];
  if (a.keyCamelot && b.keyCamelot && harmonicScore(a.keyCamelot, b.keyCamelot) >= 0.85) {
    r.push(b.keyCamelot);
  }
  if (a.bpm != null && b.bpm != null && tempoScore(a.bpm, b.bpm) === 1) {
    r.push(`${Math.round(b.bpm)} BPM`);
  }
  if (b.genre && genreScore(a.genre, b.genre) >= 0.75) r.push(b.genre);
  if (ta.energy != null && tb.energy != null && Math.abs(ta.energy - tb.energy) <= 1) {
    r.push(`E${tb.energy}`);
  }
  return r;
}

export const COMPAT_COLOR: Record<CompatLevel, string> = {
  ok: "var(--color-sig)",
  okay: "var(--color-sig-dim)",
  break: "var(--color-accent)",
};

export const COMPAT_LABEL: Record<CompatLevel, string> = {
  ok: "harmonisch",
  okay: "okay",
  break: "Bruch",
};

export const COMPAT_DASH: Record<CompatLevel, string> = {
  ok: "solid",
  okay: "dashed",
  break: "dotted",
};
