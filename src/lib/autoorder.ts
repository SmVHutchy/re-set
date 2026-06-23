import type { Track } from "./nml";
import type { PersistState } from "./store/types";
import { EMPTY_TAGS } from "./store/types";
import { compatibility } from "./compat";

// Greedy-Harmonize: starte beim energieärmsten Track (Warmup), hänge jeweils
// den kompatibelsten verbleibenden an (Harmonik + Tempo + Energie).
export function harmonizeOrder(items: Track[], state: PersistState): string[] {
  if (items.length <= 2) return items.map((t) => t.id);
  const tg = (t: Track) => state.tags[t.id] ?? EMPTY_TAGS;

  const remaining = [...items].sort((a, b) => (tg(a).energy ?? 5) - (tg(b).energy ?? 5));
  const order: Track[] = [remaining.shift()!];

  while (remaining.length) {
    const last = order[order.length - 1];
    let bestI = 0;
    let bestScore = -1;
    for (let i = 0; i < remaining.length; i++) {
      const s = compatibility(last, remaining[i], tg(last), tg(remaining[i])).score;
      if (s > bestScore) {
        bestScore = s;
        bestI = i;
      }
    }
    order.push(remaining.splice(bestI, 1)[0]);
  }
  return order.map((t) => t.id);
}
