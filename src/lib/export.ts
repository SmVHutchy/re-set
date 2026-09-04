import type { Track } from "./nml";
import type { PersistState } from "./store/types";
import { EMPTY_TAGS } from "./store/types";
import { PHASES, PHASE_LABEL, type Phase } from "./tags";

// Set-Tracks in Phasen-Reihenfolge (pre → mid → peak → late) bündeln; Tracks
// ohne Phase kommen als eigene Gruppe ans Ende. Reihenfolge innerhalb einer
// Phase = die aktuelle Set-Reihenfolge. Das ist die Grundlage aller Exporte,
// damit „sortiert nach den markierten Farben" durchgängig gilt.
export interface PhaseGroup {
  phase: Phase | null;
  label: string;
  items: Track[];
}

export function groupByPhase(items: Track[], state: PersistState): PhaseGroup[] {
  const groups: PhaseGroup[] = [];
  for (const p of PHASES) {
    const inPhase = items.filter((t) => (state.tags[t.id] ?? EMPTY_TAGS).phase === p);
    if (inPhase.length) groups.push({ phase: p, label: PHASE_LABEL[p], items: inPhase });
  }
  const rest = items.filter((t) => (state.tags[t.id] ?? EMPTY_TAGS).phase == null);
  if (rest.length) groups.push({ phase: null, label: "ohne Phase", items: rest });
  return groups;
}

function meta(t: Track, state: PersistState): string {
  const tg = state.tags[t.id] ?? EMPTY_TAGS;
  return [
    t.keyCamelot,
    t.bpm != null ? `${Math.round(t.bpm)} BPM` : null,
    tg.energy != null ? `E${tg.energy}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

// Lesbare Tracklist zum Teilen/Kopieren — nach Phasen-Abschnitten gegliedert.
export function tracklistText(items: Track[], state: PersistState): string {
  const groups = groupByPhase(items, state);
  return groups
    .map((g) => {
      const head = `## ${g.label.toUpperCase()} (${g.items.length})`;
      const lines = g.items.map((t, i) => {
        const m = meta(t, state);
        return `${i + 1}. ${t.artist} – ${t.title}${m ? `  (${m})` : ""}`;
      });
      return [head, ...lines].join("\n");
    })
    .join("\n\n");
}

// M3U-Zeilen für eine Track-Liste (mit Dateipfaden für Re-Import in Traktor).
function m3uLines(items: Track[]): string[] {
  const lines: string[] = [];
  for (const t of items) {
    lines.push(`#EXTINF:${t.durationS ?? -1},${t.artist} - ${t.title}`);
    lines.push(t.path ?? t.title);
  }
  return lines;
}

// Ein M3U, in Phasen-Reihenfolge geordnet, mit #EXTGRP-Markern pro Phase.
// Importiert als eine Playlist, die den Set-Bogen pre → peak → late abbildet.
export function m3u(items: Track[], state: PersistState): string {
  const lines = ["#EXTM3U"];
  for (const g of groupByPhase(items, state)) {
    lines.push(`#EXTGRP:${g.label}`);
    lines.push(...m3uLines(g.items));
  }
  return lines.join("\n") + "\n";
}

// Ein M3U pro Phase → in Traktor werden daraus getrennte, farb-sortierte
// Playlists (pre/mid/peak/late). Nur nicht-leere Phasen.
export interface PhaseFile {
  phase: Phase | null;
  label: string;
  content: string;
}

export function m3uPerPhase(items: Track[], state: PersistState): PhaseFile[] {
  return groupByPhase(items, state).map((g) => ({
    phase: g.phase,
    label: g.label,
    content: ["#EXTM3U", `#EXTGRP:${g.label}`, ...m3uLines(g.items)].join("\n") + "\n",
  }));
}

// XML-Attribut-Escaping für den NML-Export.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Traktor-Playlist-UUIDs sind 32 Hex-Zeichen ohne Bindestriche.
function uuid(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// PRIMARYKEY = rohe LOCATION-Konkatenation — byte-identisch mit Traktors
// eigenem Format, daher matcht der Import direkt auf die Collection.
function trackKey(t: Track): string {
  return `${t.loc!.volume}${t.loc!.dir}${t.loc!.file}`;
}

// Vollwertiger Collection-Eintrag: Re:SET-Notizen (Phase · Energie · Vibes)
// landen in Traktors COMMENT-Feld; BPM/Key/Genre/Spielzeit kommen mit, damit
// Tracks, die Traktor beim Import NEU anlegt, nicht nackt (BPM 0.00) dastehen.
// Bereits vorhandene Collection-Einträge lässt Traktor unangetastet.
function entryXml(t: Track, state: PersistState): string {
  const tg = state.tags[t.id] ?? EMPTY_TAGS;
  const notes = [
    tg.phase,
    tg.energy != null ? `E${tg.energy}` : null,
    tg.vibe.length ? tg.vibe.join(", ") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const info =
    `<INFO` +
    (t.keyRaw ? ` KEY="${esc(t.keyRaw)}"` : "") +
    (t.genre ? ` GENRE="${esc(t.genre)}"` : "") +
    (notes ? ` COMMENT="${esc(notes)}"` : "") +
    (t.durationS != null ? ` PLAYTIME="${Math.round(t.durationS)}"` : "") +
    (t.rating != null ? ` RANKING="${t.rating}"` : "") +
    `></INFO>`;
  const tempo = t.bpm != null ? `<TEMPO BPM="${t.bpm}"></TEMPO>` : "";
  const key = t.keyValue != null ? `<MUSICAL_KEY VALUE="${t.keyValue}"></MUSICAL_KEY>` : "";

  return (
    `    <ENTRY TITLE="${esc(t.title)}" ARTIST="${esc(t.artist)}">` +
    `<LOCATION DIR="${esc(t.loc!.dir)}" FILE="${esc(t.loc!.file)}" VOLUME="${esc(t.loc!.volume)}"></LOCATION>` +
    info +
    tempo +
    key +
    `</ENTRY>`
  );
}

function playlistNode(name: string, items: Track[], pad: string): string {
  const keys = items.map(
    (t) => `${pad}    <ENTRY><PRIMARYKEY TYPE="TRACK" KEY="${esc(trackKey(t))}"></PRIMARYKEY></ENTRY>`,
  );
  return [
    `${pad}<NODE TYPE="PLAYLIST" NAME="${esc(name)}">`,
    `${pad}  <PLAYLIST ENTRIES="${items.length}" TYPE="LIST" UUID="${uuid()}">`,
    ...keys,
    `${pad}  </PLAYLIST>`,
    `${pad}</NODE>`,
  ].join("\n");
}

// Gemeinsamer NML-Rahmen: COLLECTION + $ROOT mit genau einem Kind.
function nmlDocument(withLoc: Track[], state: PersistState, rootChild: string): string {
  return (
    [
      `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>`,
      `<NML VERSION="19"><HEAD COMPANY="www.native-instruments.com" PROGRAM="Traktor"></HEAD>`,
      `<MUSICFOLDERS></MUSICFOLDERS>`,
      `<COLLECTION ENTRIES="${withLoc.length}">`,
      ...withLoc.map((t) => entryXml(t, state)),
      `</COLLECTION>`,
      `<PLAYLISTS>`,
      `  <NODE TYPE="FOLDER" NAME="$ROOT">`,
      `    <SUBNODES COUNT="1">`,
      rootChild,
      `    </SUBNODES>`,
      `  </NODE>`,
      `</PLAYLISTS>`,
      `</NML>`,
    ].join("\n") + "\n"
  );
}

/**
 * EINE Traktor-Playlist „<Setname>" mit allen Tracks in Phasen-Reihenfolge
 * (pre → mid → peak → late). Exakt die Struktur, die Traktors eigener
 * Playlist-Export erzeugt — funktioniert daher mit Rechtsklick →
 * „Playlist importieren". Tracks ohne LOCATION werden gezählt übersprungen.
 */
export function nmlSinglePlaylist(
  items: Track[],
  state: PersistState,
  setName: string,
): { content: string; skipped: number; tracks: number } {
  const withLoc = items.filter((t) => t.loc);
  const ordered = groupByPhase(withLoc, state).flatMap((g) => g.items);
  return {
    content: nmlDocument(withLoc, state, playlistNode(setName, ordered, "      ")),
    skipped: items.length - withLoc.length,
    tracks: ordered.length,
  };
}

/**
 * Ordner „<Setname>" mit je einer Playlist pro Phase („<Setname> pre" …
 * „<Setname> late"). WICHTIG: In Traktor über Rechtsklick →
 * „Playlist-ORDNER importieren" laden — der einfache Playlist-Import nimmt
 * nur eine einzelne Playlist aus der Datei.
 */
export function nmlPlaylists(
  items: Track[],
  state: PersistState,
  setName: string,
): { content: string; skipped: number; playlists: number } {
  const withLoc = items.filter((t) => t.loc);
  const groups = groupByPhase(withLoc, state);

  const folder = [
    `      <NODE TYPE="FOLDER" NAME="${esc(setName)}">`,
    `        <SUBNODES COUNT="${groups.length}">`,
    ...groups.map((g) => playlistNode(`${setName} ${g.label}`, g.items, "        ")),
    `        </SUBNODES>`,
    `      </NODE>`,
  ].join("\n");

  return {
    content: nmlDocument(withLoc, state, folder),
    skipped: items.length - withLoc.length,
    playlists: groups.length,
  };
}
