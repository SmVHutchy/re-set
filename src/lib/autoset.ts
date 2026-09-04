import type { Track } from "./nml";
import type { PersistState } from "./store/types";
import { EMPTY_TAGS } from "./store/types";
import type { Phase } from "./tags";
import { compatibility } from "./compat";

/**
 * Lokaler Auto-Modus: weist jedem Set-Track eine Phase zu (Set-Bogen
 * pre → mid → peak → late) und optimiert die Reihenfolge innerhalb der Phasen
 * per Greedy-Nearest-Neighbor über die Kompatibilitäts-Engine (§7.1: Harmonik +
 * Tempo + Genre + Energie). Läuft komplett offline — kein Modell, keine Kosten.
 */
export interface AutoSetResult {
  order: string[]; // Track-IDs in Abspiel-Reihenfolge
  phases: Record<string, Phase>;
}

// Intensität eines Tracks: Energie-Tag (1–5) dominiert, BPM verfeinert.
// Fehlt die Energie, trägt allein das BPM-Perzentil; fehlt beides → Mittelfeld.
function intensity(t: Track, state: PersistState, bpmPercentile: number): number {
  const energy = (state.tags[t.id] ?? EMPTY_TAGS).energy;
  const e = energy != null ? (energy - 1) / 4 : null; // 0..1
  if (e != null) return e * 0.75 + bpmPercentile * 0.25;
  return bpmPercentile;
}

// BPM-Perzentil je Track innerhalb des Sets (0..1); ohne BPM → Median (0.5).
function bpmPercentiles(items: Track[]): Map<string, number> {
  const withBpm = items.filter((t) => t.bpm != null).sort((a, b) => a.bpm! - b.bpm!);
  const map = new Map<string, number>();
  for (const t of items) map.set(t.id, 0.5);
  const n = withBpm.length;
  withBpm.forEach((t, i) => map.set(t.id, n > 1 ? i / (n - 1) : 0.5));
  return map;
}

// Set-Bogen: unterste ~22 % → pre, nächste ~20 % → late (Ausklang = zweit-
// niedrigste Energie), nächste ~28 % → mid, oberste ~30 % → peak. Bei sehr
// kleinen Sets garantiert Math.max, dass pre und peak zuerst besetzt werden.
function assignPhases(sorted: { id: string }[]): Record<string, Phase> {
  const n = sorted.length;
  const nPre = Math.max(1, Math.round(n * 0.22));
  const nLate = n >= 4 ? Math.max(1, Math.round(n * 0.2)) : 0;
  const nPeak = Math.max(1, Math.round(n * 0.3));
  const nMid = Math.max(0, n - nPre - nLate - nPeak);

  const phases: Record<string, Phase> = {};
  let i = 0;
  for (let k = 0; k < nPre && i < n; k++) phases[sorted[i++].id] = "pre";
  for (let k = 0; k < nLate && i < n; k++) phases[sorted[i++].id] = "late";
  for (let k = 0; k < nMid && i < n; k++) phases[sorted[i++].id] = "mid";
  while (i < n) phases[sorted[i++].id] = "peak";
  return phases;
}

// Greedy-Kette innerhalb einer Phase: beginne beim Kurven-Startpunkt (pre/mid/
// peak: niedrigste Intensität, late: höchste) und hänge jeweils den kompatibelsten
// Track an. Kleiner Intensitäts-Bias hält die Richtung des Bogens.
function chain(
  items: Track[],
  state: PersistState,
  inten: Map<string, number>,
  descending: boolean,
): Track[] {
  if (items.length <= 1) return items;
  const rest = [...items].sort(
    (a, b) => (inten.get(a.id)! - inten.get(b.id)!) * (descending ? -1 : 1),
  );
  const out: Track[] = [rest.shift()!];
  while (rest.length) {
    const prev = out[out.length - 1];
    const tPrev = state.tags[prev.id] ?? EMPTY_TAGS;
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < rest.length; i++) {
      const cand = rest[i];
      const c = compatibility(prev, cand, tPrev, state.tags[cand.id] ?? EMPTY_TAGS);
      // Richtungs-Bias: bevorzugt Tracks, die den Bogen fortsetzen statt zurückzuspringen.
      const dir = (inten.get(cand.id)! - inten.get(prev.id)!) * (descending ? -1 : 1);
      const score = c.score + Math.max(-0.1, Math.min(0.1, dir * 0.15));
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    out.push(rest.splice(bestIdx, 1)[0]);
  }
  return out;
}

const PHASE_ORDER: Phase[] = ["pre", "mid", "peak", "late"];

export function autoSet(items: Track[], state: PersistState): AutoSetResult {
  const bpmPct = bpmPercentiles(items);
  const inten = new Map(items.map((t) => [t.id, intensity(t, state, bpmPct.get(t.id)!)]));

  const sorted = [...items].sort((a, b) => inten.get(a.id)! - inten.get(b.id)!);
  const phases = assignPhases(sorted);

  const order: string[] = [];
  for (const p of PHASE_ORDER) {
    const inPhase = items.filter((t) => phases[t.id] === p);
    const ordered = chain(inPhase, state, inten, p === "late");
    order.push(...ordered.map((t) => t.id));
  }
  return { order, phases };
}
