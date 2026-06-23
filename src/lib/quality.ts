import type { Track } from "./nml";

export type Grade = "lossless" | "high" | "good" | "ok" | "low" | "unknown";

export function grade(t: Track): Grade {
  if (t.lossless) return "lossless";
  const b = t.bitrate;
  if (b == null) return "unknown";
  if (b >= 320) return "high";
  if (b >= 256) return "good";
  if (b >= 192) return "ok";
  return "low";
}

export const GRADE_COLOR: Record<Grade, string> = {
  lossless: "var(--color-sig)",
  high: "var(--color-sig)",
  good: "var(--color-sig-dim)",
  ok: "var(--color-phase-late)",
  low: "var(--color-accent)",
  unknown: "var(--color-ink-faint)",
};

export type QualityFlag = "low" | "clip" | "fake";

export const FLAG_LABEL: Record<QualityFlag, string> = {
  low: "Low-Bitrate",
  clip: "Clipping",
  fake: "Transcode-Verdacht",
};

// Strukturelle Flags (lautheitsbasierte Ausreißer werden separat über die Library-Mediane berechnet).
export function flags(t: Track): QualityFlag[] {
  const f: QualityFlag[] = [];
  const b = t.bitrate ?? 0;
  if (!t.lossless && b > 0 && b < 192) f.push("low");
  if (t.truePeak != null && t.truePeak > 1.0) f.push("clip");
  if (!t.lossless && b >= 256 && t.hfMax != null && t.hfMax < -50) f.push("fake");
  return f;
}

// Kurzlabel fürs Cover-Badge: kbps bei Low, sonst der erste Flag.
export function badge(t: Track): { text: string; flag: QualityFlag } | null {
  const fs = flags(t);
  if (fs.length === 0) return null;
  if (fs.includes("low") && t.bitrate != null) return { text: `${t.bitrate}`, flag: "low" };
  if (fs.includes("clip")) return { text: "clip", flag: "clip" };
  return { text: "fake", flag: "fake" };
}
