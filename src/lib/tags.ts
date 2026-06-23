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

// Ein paar Vibe-Vorschläge fürs schnelle Taggen (frei erweiterbar).
export const VIBE_SUGGESTIONS = [
  "hypnotic",
  "driving",
  "euphoric",
  "dark",
  "organic",
  "rolling",
  "emotional",
];
