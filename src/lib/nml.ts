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
  folder: string | null; // Herkunfts-Ordner (Gruppen-Label in der Library)
  rating: number | null;
  coverPath: string | null;
  audioPath: string | null;
  durationS: number | null;
  bitrate: number | null; // kbps
  sampleRate: number | null;
  lossless: boolean;
  lufs: number | null; // integrierte Lautheit
  truePeak: number | null; // dBFS
  hfMax: number | null; // dB Energie über 16 kHz (Transcode-Indikator)
}

function num(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Gruppen-Label für die Library. Nutzt die FOLDER-Erweiterung unseres Importers,
 * sonst das letzte Verzeichnis-Segment des Pfads (echte Traktor-Collections).
 */
function folderLabel(folderAttr: string | null, path: string | null): string | null {
  const attr = folderAttr?.trim();
  if (attr) return attr;
  if (!path) return null;
  const dir = path.replace(/[^/]*$/, "").replace(/\/+$/, ""); // Datei ab, Slash ab
  const seg = dir.split("/").pop();
  return seg || null;
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

    // Gruppen-Label: bevorzugt unsere FOLDER-Erweiterung (MP3-Import), sonst
    // aus dem LOCATION-Verzeichnis abgeleitet (echte Traktor-Collections).
    const folder = folderLabel(entry.getAttribute("FOLDER"), path);

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
      folder,
      rating: num(info?.getAttribute("RANKING") ?? null),
      // COVERART/AUDIO sind Eigenheiten unseres MP3-Importers; echte Traktor-Dateien
      // haben sie nicht (→ null, Fallback auf getönte Kachel / kein Preview).
      coverPath: entry.getAttribute("COVERART"),
      audioPath: entry.getAttribute("AUDIO"),
      durationS: num(info?.getAttribute("PLAYTIME") ?? null),
      bitrate: (() => {
        const b = num(info?.getAttribute("BITRATE") ?? null);
        return b != null ? Math.round(b / 1000) : null;
      })(),
      sampleRate: num(info?.getAttribute("SAMPLERATE") ?? null),
      lossless: info?.getAttribute("LOSSLESS") === "1",
      lufs: num(info?.getAttribute("LUFS") ?? null),
      truePeak: num(info?.getAttribute("TRUEPEAK") ?? null),
      hfMax: num(info?.getAttribute("HFMAX") ?? null),
    });
  }

  return tracks;
}
