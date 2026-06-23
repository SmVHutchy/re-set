// Importiert einen Ordner mit Audiodateien zu public/collection.local.nml und
// zieht die eingebetteten Cover nach public/covers/. Read-only auf der Quelle.
// Nutzung:  node scripts/import-music.mjs "/Pfad/zum/Musik-Ordner"
import { parseFile } from "music-metadata";
import { readdir, mkdir, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, extname, basename, resolve } from "node:path";

const AUDIO = new Set([".mp3", ".aiff", ".aif", ".flac", ".wav", ".m4a", ".ogg"]);

const inputDir = process.argv[2];
if (!inputDir) {
  console.error('Usage: node scripts/import-music.mjs "<music-folder>"');
  process.exit(1);
}

const root = resolve(inputDir);
const publicDir = resolve("public");
const coversDir = join(publicDir, "covers");
const audioDir = join(publicDir, "audio");
await mkdir(coversDir, { recursive: true });
await mkdir(audioDir, { recursive: true });

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const extFor = (fmt) => {
  if (!fmt) return "jpg";
  if (fmt.includes("png")) return "png";
  if (fmt.includes("webp")) return "webp";
  return "jpg";
};

const files = (await readdir(root))
  .filter((f) => AUDIO.has(extname(f).toLowerCase()))
  .sort();

const entries = [];
let withCover = 0;
let withBpm = 0;
let withKey = 0;

for (const f of files) {
  const full = join(root, f);
  try {
    const md = await parseFile(full);
    const c = md.common ?? {};
    const title = c.title || basename(f, extname(f));
    const artist = c.artist || c.albumartist || "Unbekannt";
    const album = c.album || "";
    const genre = (c.genre && c.genre[0]) || "";
    const bpm = c.bpm ? Math.round(Number(c.bpm)) : null;
    const key = c.key || "";
    const dur = md.format && md.format.duration ? Math.round(md.format.duration) : null;
    const hash = createHash("sha1").update(full).digest("hex").slice(0, 12);

    let coverAttr = "";
    const pic = c.picture && c.picture[0];
    if (pic && pic.data) {
      const ext = extFor(pic.format);
      const name = hash + "." + ext;
      await writeFile(join(coversDir, name), Buffer.from(pic.data));
      coverAttr = ` COVERART="/covers/${name}"`;
      withCover++;
    }

    // Audio fürs Web-Preview nach public/audio/ kopieren.
    const audioName = hash + extname(f).toLowerCase();
    await copyFile(full, join(audioDir, audioName));
    const audioAttr = ` AUDIO="/audio/${audioName}"`;

    if (bpm) withBpm++;
    if (key) withKey++;

    const albumNode = album ? `\n    <ALBUM TITLE="${esc(album)}"></ALBUM>` : "";
    const infoAttrs = [
      genre && `GENRE="${esc(genre)}"`,
      key && `KEY="${esc(key)}"`,
      dur && `PLAYTIME="${dur}"`,
    ]
      .filter(Boolean)
      .join(" ");
    const infoNode = `\n    <INFO ${infoAttrs}></INFO>`;
    const tempoNode = bpm
      ? `\n    <TEMPO BPM="${bpm}.000000" BPM_QUALITY="100.000000"></TEMPO>`
      : "";

    entries.push(
      `  <ENTRY TITLE="${esc(title)}" ARTIST="${esc(artist)}"${coverAttr}${audioAttr}>` +
        `\n    <LOCATION DIR="${esc(root)}/" FILE="${esc(f)}" VOLUME=""></LOCATION>` +
        albumNode +
        infoNode +
        tempoNode +
        `\n  </ENTRY>`,
    );
  } catch (e) {
    console.warn("übersprungen:", f, "—", e.message);
  }
}

const xml =
  `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n` +
  `<NML VERSION="19">\n` +
  `<HEAD COMPANY="www.native-instruments.com" PROGRAM="Traktor"></HEAD>\n` +
  `<MUSICFOLDERS></MUSICFOLDERS>\n` +
  `<COLLECTION ENTRIES="${entries.length}">\n` +
  entries.join("\n") +
  `\n</COLLECTION>\n</NML>\n`;

await writeFile(join(publicDir, "collection.local.nml"), xml);

console.log(`Importiert: ${entries.length} Tracks → public/collection.local.nml`);
console.log(`Cover: ${withCover}/${entries.length} · BPM: ${withBpm} · Key: ${withKey}`);
