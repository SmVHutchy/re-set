// Importiert einen Ordner mit Audiodateien zu public/collection.local.nml und
// zieht die eingebetteten Cover nach public/covers/. Read-only auf der Quelle.
// Nutzung:  node scripts/import-music.mjs "/Pfad/zum/Musik-Ordner"
import { parseFile } from "music-metadata";
import { readdir, mkdir, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, extname, basename, resolve } from "node:path";

const AUDIO = new Set([".mp3", ".aiff", ".aif", ".flac", ".wav", ".m4a", ".ogg"]);

const args = process.argv.slice(2);
let deep = args.includes("--deep");
const inputDir = args.find((a) => !a.startsWith("--"));
if (!inputDir) {
  console.error('Usage: node scripts/import-music.mjs "<music-folder>" [--deep]');
  process.exit(1);
}

if (deep && spawnSync("ffmpeg", ["-version"]).status !== 0) {
  console.warn("ffmpeg nicht gefunden — Deep-Scan (LUFS/Peak/Cutoff) übersprungen.");
  deep = false;
}

// ebur128 (Lautheit + True-Peak) + Hochpass>16k + volumedetect (HF-Energie für Transcode-Verdacht).
function deepScan(file) {
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true,highpass=f=16000,volumedetect", "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 1 << 25 },
  );
  const s = (r.stderr || "") + (r.stdout || "");
  // LUFS/Peak stehen erst in der End-Summary → letztes Vorkommen nehmen
  // (frühe Frames liefern Stille-Startwerte wie -70 LUFS).
  const last = (re) => {
    const all = [...s.matchAll(re)];
    return all.length ? all[all.length - 1][1] : null;
  };
  const first = (re) => {
    const x = s.match(re);
    return x ? x[1] : null;
  };
  return {
    lufs: last(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g),
    peak: last(/Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/g),
    hf: first(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/),
  };
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
let deepOk = 0;

for (const [idx, f] of files.entries()) {
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
    const fmt = md.format ?? {};
    const dur = fmt.duration ? Math.round(fmt.duration) : null;
    const bitrate = fmt.bitrate ? Math.round(fmt.bitrate) : null;
    const sampleRate = fmt.sampleRate || null;
    const lossless = fmt.lossless ? 1 : 0;
    const hash = createHash("sha1").update(full).digest("hex").slice(0, 12);

    let deepAttrs = "";
    if (deep) {
      const d = deepScan(full);
      deepAttrs = [
        d.lufs && `LUFS="${d.lufs}"`,
        d.peak && `TRUEPEAK="${d.peak}"`,
        d.hf && `HFMAX="${d.hf}"`,
      ]
        .filter(Boolean)
        .join(" ");
      if (d.lufs) deepOk++;
      process.stdout.write(`  Deep-Scan ${idx + 1}/${files.length}\r`);
    }

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
      bitrate && `BITRATE="${bitrate}"`,
      sampleRate && `SAMPLERATE="${sampleRate}"`,
      `LOSSLESS="${lossless}"`,
      deepAttrs,
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
if (deep) console.log(`Deep-Scan (LUFS/Peak/HF): ${deepOk}/${entries.length}`);
