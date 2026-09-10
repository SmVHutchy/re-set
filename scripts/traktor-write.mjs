// Schreibt Set-Playlists direkt in eine bestehende Traktor-collection.nml.
//
// Entwurfsentscheidung, die alles andere bestimmt: **chirurgisch statt neu
// serialisieren.** Die Datei wird als Text behandelt und nur an zwei Stellen
// ergänzt — neue <ENTRY> vor </COLLECTION>, ein Playlist-Knoten in $ROOT.
// Alles andere bleibt Byte für Byte, wie Traktor es geschrieben hat.
//
// Der Grund ist nicht Bequemlichkeit: die Collection enthält Felder, deren
// Bedeutung wir nicht kennen (FLAGS Bit 4, CUE_V2 REPEATS, DISPL_ORDER,
// AUDIO_ID). Wer parst und neu schreibt, riskiert, genau die zu verlieren —
// und mit ihnen Cues, Beatgrids und Analysen, die dich Stunden gekostet haben.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

/** Findet Traktors aktive collection.nml. Neueste Version gewinnt. */
export function findCollection() {
  const base = path.join(os.homedir(), "Documents", "Native Instruments");
  let kandidaten = [];
  try {
    kandidaten = fs
      .readdirSync(base, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^Traktor/i.test(e.name))
      .map((e) => path.join(base, e.name, "collection.nml"))
      .filter((p) => fs.existsSync(p));
  } catch {
    return null;
  }
  if (!kandidaten.length) return null;
  // Nach Änderungszeit: wer zuletzt geschrieben hat, ist die aktive Version.
  kandidaten.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return kandidaten[0];
}

/**
 * Läuft Traktor gerade? Dann darf nicht geschrieben werden: Traktor hält die
 * Collection im Speicher und überschreibt beim Beenden alles, was wir
 * inzwischen hineingeschrieben haben — die Arbeit wäre still verloren.
 */
export function isTraktorRunning() {
  if (process.platform === "win32") {
    const r = spawnSync("tasklist", ["/FI", "IMAGENAME eq Traktor.exe", "/NH"], {
      encoding: "utf8",
    });
    return /Traktor\.exe/i.test(r.stdout ?? "");
  }
  const r = spawnSync("pgrep", ["-x", "Traktor"], { encoding: "utf8" });
  return r.status === 0;
}

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Gegenstueck zu `esc`. Zwingend fuer den Schluesselvergleich: in der Datei
 * steht `DJ Jamo &amp; Jack Knives`, der Client schickt `DJ Jamo & Jack
 * Knives`. Ohne Dekodierung gilt so ein Track als unbekannt, und wir legen
 * einen zweiten Eintrag fuer eine Datei an, die Traktor laengst kennt — mit
 * allen Cues und Analysen am alten Eintrag.
 */
const unesc = (s) =>
  String(s ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Traktors PRIMARYKEY ist die rohe Verkettung aus VOLUME + DIR + FILE. */
export function primaryKey(loc) {
  return `${loc.volume ?? ""}${loc.dir ?? ""}${loc.file ?? ""}`;
}

/**
 * Liest die vorhandenen LOCATION-Schlüssel. Damit steht fest, welche Tracks
 * die Collection schon kennt — und genau die werden nicht angefasst.
 */
export function vorhandeneSchluessel(xml) {
  const keys = new Set();
  for (const m of xml.matchAll(/<LOCATION\b([^>]*)>/g)) {
    const attrs = m[1];
    const g = (n) => unesc((attrs.match(new RegExp(`\\b${n}="([^"]*)"`)) ?? [])[1] ?? "");
    keys.add(`${g("VOLUME")}${g("DIR")}${g("FILE")}`);
  }
  return keys;
}

/** Namen der bereits vorhandenen Playlists — für Kollisionswarnungen. */
export function vorhandenePlaylists(xml) {
  const namen = [];
  for (const m of xml.matchAll(/<NODE TYPE="PLAYLIST" NAME="([^"]*)"/g)) namen.push(m[1]);
  return namen;
}

function entryXml(t, opt) {
  const mitGrid = opt.grid && t.gridMs != null && t.bpm != null && !t.bpmEstimated;
  const flags = mitGrid ? 8 | (opt.sperren ? 16 : 0) : 0;
  const lockAttrs =
    mitGrid && opt.sperren
      ? ` LOCK="1" LOCK_MODIFICATION_TIME="${new Date().toISOString().slice(0, 19)}"`
      : "";

  const info =
    `<INFO` +
    (t.genre ? ` GENRE="${esc(t.genre)}"` : "") +
    (t.comment ? ` COMMENT="${esc(t.comment)}"` : "") +
    (t.durationS != null ? ` PLAYTIME="${Math.round(t.durationS)}"` : "") +
    (flags ? ` FLAGS="${flags}"` : "") +
    `></INFO>`;
  const tempo =
    t.bpm != null
      ? `<TEMPO BPM="${Number(t.bpm).toFixed(6)}"${mitGrid ? ' BPM_QUALITY="100.000000"' : ""}></TEMPO>`
      : "";
  const key = t.keyValue != null ? `<MUSICAL_KEY VALUE="${t.keyValue}"></MUSICAL_KEY>` : "";
  const grid = mitGrid
    ? `<CUE_V2 NAME="AutoGrid" DISPL_ORDER="0" TYPE="4" START="${Number(t.gridMs).toFixed(6)}" LEN="0.000000" REPEATS="-1" HOTCUE="-1"></CUE_V2>`
    : "";

  return (
    `  <ENTRY TITLE="${esc(t.title)}" ARTIST="${esc(t.artist)}"${lockAttrs}>` +
    `<LOCATION DIR="${esc(t.loc.dir)}" FILE="${esc(t.loc.file)}" VOLUME="${esc(t.loc.volume)}"></LOCATION>` +
    info +
    tempo +
    key +
    grid +
    `</ENTRY>`
  );
}

function playlistNode(name, keys, pad) {
  return [
    `${pad}<NODE TYPE="PLAYLIST" NAME="${esc(name)}">`,
    `${pad}  <PLAYLIST ENTRIES="${keys.length}" TYPE="LIST" UUID="${crypto.randomUUID().replace(/-/g, "")}">`,
    ...keys.map((k) => `${pad}    <ENTRY><PRIMARYKEY TYPE="TRACK" KEY="${esc(k)}"></PRIMARYKEY></ENTRY>`),
    `${pad}  </PLAYLIST>`,
    `${pad}</NODE>`,
  ].join("\n");
}

/**
 * Baut die neue Datei. Reine Funktion: bekommt XML und Plan, gibt XML zurück,
 * fasst nichts an. Dadurch prüfbar, ohne eine echte Collection zu riskieren.
 *
 * Rückgabe enthält auch die Kennzahlen für die Vorschau.
 */
export function schreibePlaylists(xml, { setName, gruppen, opt }) {
  const vorhanden = vorhandeneSchluessel(xml);
  const neueEintraege = [];
  const schonDa = [];
  let mitGrid = 0;

  for (const g of gruppen) {
    for (const t of g.tracks) {
      const k = primaryKey(t.loc);
      if (vorhanden.has(k)) {
        // Schon in der Collection: nicht anfassen. Der vorhandene Eintrag
        // traegt Cues, Beatgrid und Analysen, die dort bleiben — auch wenn
        // unsere Werte anders lauten.
        schonDa.push(k);
        continue;
      }
      vorhanden.add(k); // derselbe Track kann in mehreren Phasen liegen
      neueEintraege.push(entryXml(t, opt));
      if (opt.grid && t.gridMs != null && t.bpm != null && !t.bpmEstimated) mitGrid++;
    }
  }

  // --- 1. Neue Einträge vor </COLLECTION> ---------------------------------
  let out = xml;
  if (neueEintraege.length) {
    const ende = out.lastIndexOf("</COLLECTION>");
    if (ende === -1) throw new Error("Kein </COLLECTION> gefunden — keine Traktor-NML?");
    out = out.slice(0, ende) + neueEintraege.join("\n") + "\n" + out.slice(ende);

    // Zähler nachziehen. Traktor korrigiert ihn zwar selbst, aber eine Datei,
    // die sich selbst widerspricht, ist ein schlechter Ausgangspunkt fürs
    // Debuggen, wenn später etwas schiefgeht.
    out = out.replace(
      /<COLLECTION ENTRIES="(\d+)">/,
      (_, n) => `<COLLECTION ENTRIES="${Number(n) + neueEintraege.length}">`,
    );
  }

  // --- 2. Playlist-Ordner in $ROOT ----------------------------------------
  const wurzel = out.match(/<NODE TYPE="FOLDER" NAME="\$ROOT">\s*<SUBNODES COUNT="(\d+)">/);
  if (!wurzel) throw new Error("Kein $ROOT-Knoten gefunden — keine Traktor-NML?");

  const ordner = [
    `      <NODE TYPE="FOLDER" NAME="${esc(setName)}">`,
    `        <SUBNODES COUNT="${gruppen.length}">`,
    ...gruppen.map((g) =>
      playlistNode(`${setName} ${g.label}`, g.tracks.map((t) => primaryKey(t.loc)), "        "),
    ),
    `        </SUBNODES>`,
    `      </NODE>`,
  ].join("\n");

  const einfuegen = out.indexOf(wurzel[0]) + wurzel[0].length;
  out = out.slice(0, einfuegen) + "\n" + ordner + out.slice(einfuegen);
  out = out.replace(
    /(<NODE TYPE="FOLDER" NAME="\$ROOT">\s*<SUBNODES COUNT=")(\d+)(")/,
    (_, a, n, b) => `${a}${Number(n) + 1}${b}`,
  );

  return {
    xml: out,
    neu: neueEintraege.length,
    schonVorhanden: schonDa.length,
    playlists: gruppen.length,
    // Nur neu geschriebene Eintraege koennen ein Grid von uns bekommen haben.
    // Wer schon in der Collection stand, behaelt seines — die Zahl darf nicht
    // mehr versprechen, als tatsaechlich passiert ist.
    mitGrid,
  };
}

/**
 * Schreibt atomar und mit Sicherung. Reihenfolge ist Absicht: erst die
 * Sicherung, dann die temporäre Datei, dann das Umbenennen. Ein Absturz
 * dazwischen hinterlässt nie eine halbe Collection.
 */
export function schreibeDatei(ziel, inhalt) {
  const stempel = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const sicherung = `${ziel}.${stempel}.bak`;
  fs.copyFileSync(ziel, sicherung, fs.constants.COPYFILE_EXCL);

  const temp = `${ziel}.${process.pid}.tmp`;
  fs.writeFileSync(temp, inhalt, "utf-8");
  fs.renameSync(temp, ziel);

  return sicherung;
}
