import { toCamelot } from "./camelot";

/**
 * Ein Cue-Punkt aus `<CUE_V2>`. `type` ist Traktors roher Code, `kind` unsere
 * Deutung davon — die Codes sind nirgends dokumentiert und wurden aus einer
 * echten Collection abgeleitet (679 Cues, siehe docs/UNIFIED-PIPELINE.md §7).
 * Unbekannte Codes werden durchgereicht, nicht verworfen.
 */
export type CueKind = "hotcue" | "grid" | "loop" | "unbekannt";

export interface CuePoint {
  name: string | null;
  type: number;
  kind: CueKind;
  startMs: number;
  lengthMs: number;
  slot: number | null; // HOTCUE; -1 in der Datei bedeutet „kein Slot" → null
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  genre: string | null;
  bpm: number | null;
  keyCamelot: string | null;
  keyRaw: string | null;
  keyValue: number | null; // Traktors MUSICAL_KEY VALUE (0–23) — für den Re-Export
  // Aus unserer eigenen Analyse gerechnet statt aus einem Tag gelesen. Das
  // muss sichtbar bleiben: eine geschätzte Tonart trifft nicht immer, und wer
  // nach ihr mixt, sollte das wissen. Traktor-Werte gewinnen beim Re-Sync.
  bpmEstimated: boolean;
  keyEstimated: boolean;
  path: string | null;
  // Rohe LOCATION-Attribute (Traktors /:-Format) — für den NML-Export, damit
  // die PRIMARYKEYs exakt den Pfaden in der Traktor-Collection entsprechen.
  loc: { volume: string; dir: string; file: string } | null;
  folder: string | null; // Herkunfts-Ordner (Gruppen-Label in der Library)
  playlists: string[]; // Traktor-Playlists, in denen der Track liegt (aus <PLAYLISTS>)
  cues: CuePoint[]; // Hotcues, Loops und Grid-Marker in Datei-Reihenfolge
  playcount: number | null;
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

/**
 * Traktors CUE_V2-TYPE-Codes, abgeleitet aus 679 Cues einer echten Collection:
 * TYPE=4 heißt „AutoGrid"/„Beat Marker", trägt nie einen Slot und liegt fast
 * immer in den ersten Takten; TYPE=0 hat immer einen Slot und keine Länge;
 * TYPE=5 hat Slot *und* Länge. Andere Codes kamen in den Daten nicht vor und
 * bleiben deshalb ausdrücklich ungedeutet.
 */
function cueKind(type: number, slot: number, lengthMs: number): CueKind {
  if (type === 4) return "grid";
  if (type === 5 || (slot >= 0 && lengthMs > 0)) return "loop";
  if (type === 0 && slot >= 0) return "hotcue";
  return "unbekannt";
}

function parseCues(entry: Element): CuePoint[] {
  const out: CuePoint[] = [];
  for (const c of Array.from(entry.getElementsByTagName("CUE_V2"))) {
    const start = Number(c.getAttribute("START") ?? NaN);
    if (!Number.isFinite(start)) continue; // ohne Position ist ein Cue wertlos
    const slot = Number(c.getAttribute("HOTCUE") ?? -1);
    const len = Number(c.getAttribute("LEN") ?? 0) || 0;
    const type = Number(c.getAttribute("TYPE") ?? -1);
    out.push({
      name: c.getAttribute("NAME"),
      type,
      kind: cueKind(type, slot, len),
      startMs: start,
      lengthMs: len,
      slot: slot >= 0 ? slot : null,
    });
  }
  return out;
}

function num(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Traktor kodiert Pfade als `VOLUME/:Ordner/:Datei.mp3`. Wir normalisieren `/:`
 * zu `/`, damit die PRIMARYKEYs aus <PLAYLISTS> mit den LOCATION-Pfaden der
 * Einträge zusammenpassen (beide laufen durch dieselbe Ersetzung).
 */
function normKey(s: string): string {
  return s.replace(/\/:/g, "/");
}

/**
 * Baut eine Zuordnung normalisierter Track-Pfad → Playlist-Namen aus der
 * <PLAYLISTS>-Sektion. So wissen wir für jeden Track, aus welcher Playlist er
 * stammt — Traktor-Collections tragen diese Info nicht am ENTRY selbst.
 */
function collectPlaylists(doc: Document): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const nodes = Array.from(doc.getElementsByTagName("NODE"));
  for (const node of nodes) {
    if (node.getAttribute("TYPE") !== "PLAYLIST") continue;
    const name = node.getAttribute("NAME")?.trim();
    if (!name) continue;
    const playlist = node.getElementsByTagName("PLAYLIST")[0];
    if (!playlist) continue;
    for (const pk of Array.from(playlist.getElementsByTagName("PRIMARYKEY"))) {
      const raw = pk.getAttribute("KEY");
      if (!raw) continue;
      const key = normKey(raw);
      const arr = map.get(key);
      if (arr) {
        if (!arr.includes(name)) arr.push(name);
      } else {
        map.set(key, [name]);
      }
    }
  }
  return map;
}

/**
 * Gruppen-Label für die Library. Bevorzugt die FOLDER-Erweiterung unseres
 * Importers, dann die Playlist-Herkunft (echte Traktor-Uploads), sonst das
 * letzte Verzeichnis-Segment des Pfads.
 */
function folderLabel(
  folderAttr: string | null,
  path: string | null,
  playlists: string[],
): string | null {
  const attr = folderAttr?.trim();
  if (attr) return attr;
  // „Ordner"-Sortierung meint echten Datei-Ordner → das Verzeichnis hat Vorrang
  // vor der Playlist-Herkunft (die nur greift, wenn gar kein Pfad da ist).
  if (path) {
    const dir = path.replace(/[^/]*$/, "").replace(/\/+$/, ""); // Datei ab, Slash ab
    const seg = dir.split("/").pop();
    if (seg) return seg;
  }
  if (playlists.length) return playlists[0];
  return null;
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
  const playlistsByPath = collectPlaylists(doc);

  for (const entry of entries) {
    const title = entry.getAttribute("TITLE")?.trim() || "";
    const artist = entry.getAttribute("ARTIST")?.trim() || "";

    const info = entry.getElementsByTagName("INFO")[0] ?? null;
    const tempo = entry.getElementsByTagName("TEMPO")[0] ?? null;
    const key = entry.getElementsByTagName("MUSICAL_KEY")[0] ?? null;
    const loc = entry.getElementsByTagName("LOCATION")[0] ?? null;
    const album = entry.getElementsByTagName("ALBUM")[0] ?? null;

    const path = loc
      ? normKey(
          [loc.getAttribute("VOLUME"), loc.getAttribute("DIR"), loc.getAttribute("FILE")]
            .filter(Boolean)
            .join(""),
        )
      : null;

    // Audio + Cover liegen bei echten Traktor-Tracks in der Datei am LOCATION-
    // Pfad (kein AUDIO/COVERART-Attribut — das setzt nur unser MP3-Importer).
    // Wir zeigen auf die Server-Endpoints, die beides direkt vom Pfad liefern.
    const locQuery = loc
      ? `vol=${encodeURIComponent(loc.getAttribute("VOLUME") ?? "")}` +
        `&dir=${encodeURIComponent(loc.getAttribute("DIR") ?? "")}` +
        `&file=${encodeURIComponent(loc.getAttribute("FILE") ?? "")}`
      : null;

    const audioAttr = entry.getAttribute("AUDIO");
    const audioPath = audioAttr ?? (locQuery ? `/api/audio?${locQuery}` : null);

    const coverAttr = entry.getAttribute("COVERART");
    const coverPath = coverAttr ?? (locQuery ? `/api/cover?${locQuery}` : null);

    // Playlist-Herkunft: welche Traktor-Playlists referenzieren diesen Pfad?
    const playlists = path ? (playlistsByPath.get(path) ?? []) : [];

    // Gruppen-Label: bevorzugt unsere FOLDER-Erweiterung (MP3-Import), dann die
    // Playlist-Herkunft (echte Traktor-Uploads), sonst das LOCATION-Verzeichnis.
    const folder = folderLabel(entry.getAttribute("FOLDER"), path, playlists);

    const keyRaw = info?.getAttribute("KEY") ?? null;
    const keyValue = num(key?.getAttribute("VALUE") ?? null);
    // ESTIMATED="bpm key" setzt unser Importer für selbst gerechnete Werte.
    const estimated = (info?.getAttribute("ESTIMATED") ?? "").split(/\s+/);

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
      keyValue,
      bpmEstimated: estimated.includes("bpm"),
      keyEstimated: estimated.includes("key"),
      path,
      loc: loc
        ? {
            volume: loc.getAttribute("VOLUME") ?? "",
            dir: loc.getAttribute("DIR") ?? "",
            file: loc.getAttribute("FILE") ?? "",
          }
        : null,
      folder,
      playlists,
      cues: parseCues(entry),
      playcount: num(info?.getAttribute("PLAYCOUNT") ?? null),
      rating: num(info?.getAttribute("RANKING") ?? null),
      // COVERART/AUDIO sind Eigenheiten unseres MP3-Importers; echte Traktor-Dateien
      // haben sie nicht (→ null, Fallback auf getönte Kachel / kein Preview).
      coverPath,
      audioPath,
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
