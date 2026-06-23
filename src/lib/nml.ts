import { toCamelot } from "./camelot";

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  genre: string | null;
  bpm: number | null;
  keyCamelot: string | null;
  keyRaw: string | null;
  path: string | null;
  rating: number | null;
  coverPath: string | null;
  audioPath: string | null;
  durationS: number | null;
}

function num(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parst eine Traktor `collection.nml` (XML) zu einer Track-Liste.
 * Bewusst defensiv: fehlende Felder werden zu null, nichts wirft.
 */
export function parseNml(xml: string): Track[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("collection.nml ist kein gültiges XML.");
  }

  const entries = Array.from(doc.getElementsByTagName("ENTRY"));
  const tracks: Track[] = [];

  for (const entry of entries) {
    const title = entry.getAttribute("TITLE")?.trim() || "";
    const artist = entry.getAttribute("ARTIST")?.trim() || "";

    const info = entry.getElementsByTagName("INFO")[0] ?? null;
    const tempo = entry.getElementsByTagName("TEMPO")[0] ?? null;
    const key = entry.getElementsByTagName("MUSICAL_KEY")[0] ?? null;
    const loc = entry.getElementsByTagName("LOCATION")[0] ?? null;
    const album = entry.getElementsByTagName("ALBUM")[0] ?? null;

    const path = loc
      ? [loc.getAttribute("VOLUME"), loc.getAttribute("DIR"), loc.getAttribute("FILE")]
          .filter(Boolean)
          .join("")
          .replace(/\/:/g, "/")
      : null;

    const keyRaw = info?.getAttribute("KEY") ?? null;
    const keyValue = num(key?.getAttribute("VALUE") ?? null);

    // Ohne Titel und Pfad ist ein Eintrag nicht sinnvoll referenzierbar.
    if (!title && !path) continue;

    tracks.push({
      id: path || `${artist}::${title}`,
      title: title || "(ohne Titel)",
      artist: artist || "Unbekannt",
      album: album?.getAttribute("TITLE")?.trim() || null,
      genre: info?.getAttribute("GENRE")?.trim() || null,
      bpm: num(tempo?.getAttribute("BPM") ?? null),
      keyCamelot: toCamelot(keyRaw, keyValue),
      keyRaw,
      path,
      rating: num(info?.getAttribute("RANKING") ?? null),
      // COVERART/AUDIO sind Eigenheiten unseres MP3-Importers; echte Traktor-Dateien
      // haben sie nicht (→ null, Fallback auf getönte Kachel / kein Preview).
      coverPath: entry.getAttribute("COVERART"),
      audioPath: entry.getAttribute("AUDIO"),
      durationS: num(info?.getAttribute("PLAYTIME") ?? null),
    });
  }

  return tracks;
}
