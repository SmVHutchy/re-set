// DEMO-Tagging: bis echtes Energie/Phasen-Tagging existiert (PFLICHTENHEFT FA-6),
// leiten wir hier deterministische Platzhalter aus der Track-ID ab — nur damit
// das Farbsystem (Thermal-Phasen) im AP0-Grid sichtbar wird. NICHT die echte Logik.

export type Phase = "pre" | "mid" | "peak" | "late";

export const PHASES: Phase[] = ["pre", "mid", "peak", "late"];

export const PHASE_LABEL: Record<Phase, string> = {
  pre: "pre",
  mid: "mid",
  peak: "peak",
  late: "late",
};

export const PHASE_COLOR: Record<Phase, string> = {
  pre: "var(--color-phase-pre)",
  mid: "var(--color-phase-mid)",
  peak: "var(--color-phase-peak)",
  late: "var(--color-phase-late)",
};

// FNV-1a — stabiler Hash für deterministische Demo-Werte.
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface DemoTags {
  phase: Phase;
  energy: number; // 1–10
}

export function demoTags(id: string): DemoTags {
  const h = hash(id);
  const phase = PHASES[h % 4];
  const energy = 1 + ((h >> 3) % 10);
  return { phase, energy };
}
