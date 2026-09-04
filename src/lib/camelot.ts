// Traktor speichert die Tonart als Integer 0–23 in <MUSICAL_KEY VALUE="…"/>.
// Mapping auf das Camelot-Rad (1A–12B) — die gängige reverse-engineerte Tabelle.
const TRAKTOR_KEY_TO_CAMELOT: Record<number, string> = {
  0: "8B", 1: "3B", 2: "10B", 3: "5B", 4: "12B", 5: "7B",
  6: "2B", 7: "9B", 8: "4B", 9: "11B", 10: "6B", 11: "1B",
  12: "5A", 13: "12A", 14: "7A", 15: "2A", 16: "9A", 17: "4A",
  18: "11A", 19: "6A", 20: "1A", 21: "8A", 22: "3A", 23: "10A",
};

// Klassische Tonart-Namen (z. B. aus <INFO KEY="Am"/>) → Camelot.
const NAME_TO_CAMELOT: Record<string, string> = {
  "B": "1B", "F#": "2B", "Gb": "2B", "Db": "3B", "C#": "3B", "Ab": "4B", "G#": "4B",
  "Eb": "5B", "D#": "5B", "Bb": "6B", "A#": "6B", "F": "7B", "C": "8B", "G": "9B",
  "D": "10B", "A": "11B", "E": "12B",
  "Abm": "1A", "G#m": "1A", "Ebm": "2A", "D#m": "2A", "Bbm": "3A", "A#m": "3A",
  "Fm": "4A", "Cm": "5A", "Gm": "6A", "Dm": "7A", "Am": "8A", "Em": "9A",
  "Bm": "10A", "F#m": "11A", "Gbm": "11A", "Dbm": "12A", "C#m": "12A",
};

const CAMELOT_RE = /^(1[0-2]|[1-9])[ABab]$/;

// Open Key (1m–12m Moll, 1d–12d Dur) — die Schreibweise, in der die Key-Tags
// unserer Download-Sammlung durchgängig stehen. Ohne diese Umrechnung wird ein
// vorhandener Key als „fehlt" angezeigt.
//
// Camelot und Open Key zählen dasselbe Rad mit unterschiedlichem Nullpunkt: die
// Camelot-Zahl liegt sieben Positionen weiter (1m = 8A, 6m = 1A, 12d = 7B).
// Empirisch bestätigt an 497 Tracks, bei denen Traktors MUSICAL_KEY und der
// Open-Key-Tag beide vorlagen — keine einzige mehrdeutige Zuordnung.
const OPEN_KEY_RE = /^(0?[1-9]|1[0-2])\s*([dm])$/i;

function openKeyToCamelot(k: string): string | null {
  const m = OPEN_KEY_RE.exec(k);
  if (!m) return null;
  const num = ((parseInt(m[1], 10) + 6) % 12) + 1;
  return `${num}${m[2].toLowerCase() === "m" ? "A" : "B"}`;
}

/** Liefert einen Camelot-Code aus rohem Key-Text bzw. dem Traktor-Integer. */
export function toCamelot(rawKey: string | null, traktorValue: number | null): string | null {
  if (rawKey) {
    const k = rawKey.trim();
    if (CAMELOT_RE.test(k)) return k.toUpperCase();
    if (NAME_TO_CAMELOT[k]) return NAME_TO_CAMELOT[k];
    const open = openKeyToCamelot(k);
    if (open) return open;
  }
  if (traktorValue != null && TRAKTOR_KEY_TO_CAMELOT[traktorValue]) {
    return TRAKTOR_KEY_TO_CAMELOT[traktorValue];
  }
  return null;
}

/** Zerlegt einen Camelot-Code in Zahl (1–12) und Buchstabe (A/B). */
function parseCamelot(code: string): { num: number; letter: "A" | "B" } | null {
  const m = code.match(/^(\d{1,2})([AB])$/);
  if (!m) return null;
  return { num: parseInt(m[1], 10), letter: m[2] as "A" | "B" };
}

/** Harmonische Nähe zweier Camelot-Codes: 1 = perfekt … 0 = Bruch. */
export function harmonicScore(a: string | null, b: string | null): number {
  if (!a || !b) return 0.5;
  const pa = parseCamelot(a);
  const pb = parseCamelot(b);
  if (!pa || !pb) return 0.5;
  if (pa.num === pb.num && pa.letter === pb.letter) return 1; // identisch
  if (pa.num === pb.num) return 0.85; // Dur/Moll-Wechsel
  const dist = Math.min(
    Math.abs(pa.num - pb.num),
    12 - Math.abs(pa.num - pb.num),
  );
  if (pa.letter === pb.letter && dist === 1) return 0.9; // ±1 auf dem Rad
  if (dist === 1) return 0.55;
  return 0.2;
}
