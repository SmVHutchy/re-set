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

export interface Compatibility {
  score: number;
  level: CompatLevel;
}

// Gewichteter Score aus Harmonik / Tempo / Energie (PFLICHTENHEFT §7.1).
export function compatibility(
  a: Track,
  b: Track,
  ta: TrackTags,
  tb: TrackTags,
): Compatibility {
  const harm = harmonicScore(a.keyCamelot, b.keyCamelot);
  const tempo = tempoScore(a.bpm, b.bpm);
  const energy = energyScore(ta.energy, tb.energy);
  const score = 0.5 * harm + 0.3 * tempo + 0.2 * energy;
  const level: CompatLevel = score >= 0.75 ? "ok" : score >= 0.5 ? "okay" : "break";
  return { score, level };
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
