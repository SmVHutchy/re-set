// Importiert einen Ordner mit Audiodateien zu public/collection.local.nml und
// zieht die eingebetteten Cover nach public/covers/. Read-only auf der Quelle.
// Nutzung:  node scripts/import-music.mjs "/Pfad/zum/Musik-Ordner"
import { parseFile } from "music-metadata";
import { readdir, mkdir, writeFile, readFile, copyFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, extname, basename, dirname, resolve, relative } from "node:path";

const AUDIO = new Set([".mp3", ".aiff", ".aif", ".flac", ".wav", ".m4a", ".ogg"]);
const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));

// Obergrenze für BPM_QUALITY bei selbst gerechneten Werten. 100 bleibt dem
// vorbehalten, was aus einem Tag oder aus Traktor kommt.
const ESTIMATED_QUALITY_CAP = 80;

// Analyse-Cache: rechner-spezifische Pfade, gehört nicht in die Versionierung
// (.gitignore deckt *.local.* ab).
const ANALYSIS_CACHE_FILE = resolve(SCRIPTS_DIR, "..", ".analysis-cache.local.json");

/**
 * Cache-Schlüssel aus Pfad, Änderungszeit und Größe — dasselbe Muster wie der
 * Cover-Cache im Server. Ändert sich die Datei, ändert sich der Schlüssel und
 * die Analyse läuft neu.
 */
async function cacheKey(full, entry) {
  const s = await stat(full);
  return `${full}|${Math.round(s.mtimeMs)}|${s.size}|${entry.dur ?? ""}`;
}

async function loadAnalysisCache() {
  try {
    const raw = JSON.parse(await readFile(ANALYSIS_CACHE_FILE, "utf-8"));
    return new Map(Object.entries(raw));
  } catch {
    return new Map(); // keine Datei / kaputt → leerer Cache, kein Grund abzubrechen
  }
}

async function saveAnalysisCache(cache) {
  try {
    await writeFile(ANALYSIS_CACHE_FILE, JSON.stringify(Object.fromEntries(cache), null, 2));
  } catch (err) {
    log(`Analyse-Cache nicht geschrieben: ${err.message}`);
  }
}

const args = process.argv.slice(2);
let deep = args.includes("--deep");
let analyze = args.includes("--analyze");
const inputDir = args.find((a) => !a.startsWith("--"));
if (!inputDir) {
  console.error('Usage: node scripts/import-music.mjs "<music-folder>" [--deep] [--analyze]');
  process.exit(1);
}

if (deep && spawnSync("ffmpeg", ["-version"]).status !== 0) {
  console.warn("ffmpeg nicht gefunden — Deep-Scan (LUFS/Peak/Cutoff) übersprungen.");
  deep = false;
}

// uv startet analyze.py mit isoliert aufgelösten Abhängigkeiten (PEP 723),
// ohne eine vorhandene Python-Umgebung anzufassen.
if (analyze && spawnSync("uv", ["--version"]).status !== 0) {
  console.warn("uv nicht gefunden — BPM/Key-Analyse übersprungen.");
  analyze = false;
}

/**
 * Schickt alle Pfade an einen einzigen analyze.py-Prozess (der librosa-Import
 * allein kostet Sekunden, pro Datei wäre das unbezahlbar) und liest die
 * JSON-Zeilen zurück. Fortschritt kommt über stderr und wandert direkt ins
 * Live-Log. Ein Fehlschlag liefert eine leere Liste statt zu werfen — der
 * Import soll auch ohne Analyse durchlaufen.
 */
function runAnalyzer(paths) {
  return new Promise((done) => {
    const child = spawn("uv", ["run", "--script", join(SCRIPTS_DIR, "analyze.py"), "--stdin"], {
      cwd: resolve(SCRIPTS_DIR, ".."),
    });
    const out = [];
    let buf = "";
    let errBuf = "";

    child.stdout.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          out.push(JSON.parse(line));
        } catch {
          log(`  Analyse: unlesbare Zeile übersprungen`);
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      errBuf += chunk.toString();
      const lines = errBuf.split("\n");
      errBuf = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) log(`  ${line.trim()}`);
    });
    child.on("error", (err) => {
      log(`Analyse nicht gestartet: ${err.message}`);
      done([]);
    });
    child.on("close", () => {
      if (buf.trim()) {
        try {
          out.push(JSON.parse(buf));
        } catch {
          // unvollständige letzte Zeile → ignorieren
        }
      }
      done(out);
    });

    child.stdin.end(paths.join("\n") + "\n");
  });
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

// Zeilenweises Log auf stdout — der Server streamt jede Zeile live in die UI.
const log = (m) => process.stdout.write(m + "\n");

// Rekursiv: Unterordner werden mitgenommen, damit die Ordner-Struktur erhalten
// bleibt (relative Pfade zur Wurzel, POSIX-Separatoren für stabile Labels).
const rootName = basename(root) || root;
log(`Scanne Ordner "${rootName}" …`);
const files = (await readdir(root, { recursive: true }))
  .map((p) => p.replace(/\\/g, "/"))
  .filter((p) => {
    const name = basename(p);
    // Versteckte Dateien überspringen — vor allem macOS-AppleDouble-Reste
    // ("._song.mp3"): winzige Metadaten-Zwillinge mit echter .mp3-Endung, die
    // sonst als nicht abspielbare Phantom-Tracks in der Library landen.
    if (name.startsWith(".")) return false;
    return AUDIO.has(extname(name).toLowerCase());
  })
  .sort();
log(`${files.length} Audiodatei${files.length === 1 ? "" : "en"} gefunden.`);
if (deep) log("Deep-Scan aktiv (LUFS/Peak/HF) — das dauert etwas länger.");

const entries = [];
let withCover = 0;
let withBpm = 0;
let withKey = 0;
let deepOk = 0;

for (const [idx, f] of files.entries()) {
  const full = join(root, f);
  // Ordner der Datei (absolut, für LOCATION) + Label relativ zur Import-Wurzel.
  const fileDir = dirname(full).replace(/\\/g, "/");
  const relDir = dirname(f) === "." ? "" : dirname(f);
  const folder = relDir ? `${rootName}/${relDir}` : rootName;
  const fileName = basename(f);
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
    let d = null;
    if (deep) {
      log(`[${idx + 1}/${files.length}] ${f} — Deep-Scan …`);
      d = deepScan(full);
      deepAttrs = [
        d.lufs && `LUFS="${d.lufs}"`,
        d.peak && `TRUEPEAK="${d.peak}"`,
        d.hf && `HFMAX="${d.hf}"`,
      ]
        .filter(Boolean)
        .join(" ");
      if (d.lufs) deepOk++;
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

    // Erst sammeln, XML später: die Analyse braucht alle Kandidaten auf
    // einmal (ein Python-Prozess statt einer je Datei), und ihre Ergebnisse
    // müssen vor dem Schreiben in den Datensatz zurückfließen.
    entries.push({
      full,
      title,
      artist,
      album,
      genre,
      key,
      bpm,
      keyEstimated: false,
      bpmEstimated: false,
      gridMs: null,
      bpmQuality: bpm ? 100 : null,
      dur,
      bitrate,
      sampleRate,
      lossless,
      deepAttrs,
      coverAttr,
      audioAttr,
      folder,
      fileDir,
      fileName,
    });

    // Kompakte Ergebniszeile pro Track fürs Live-Log.
    const facts = [
      bpm ? `BPM ${bpm}` : null,
      key ? `Key ${key}` : null,
      pic && pic.data ? "Cover" : null,
      d && d.lufs ? `LUFS ${d.lufs}` : null,
    ].filter(Boolean);
    log(`[${idx + 1}/${files.length}] ${folder}/${fileName} — ${facts.join(" · ") || "nur Basis-Tags"}`);
  } catch (e) {
    log(`[${idx + 1}/${files.length}] ${f} — übersprungen: ${e.message}`);
  }
}

// --- Analyse für Tracks ohne BPM/Key ---------------------------------------
// Downloads von Spotify/SoundCloud tragen die Felder fast nie. Ohne sie
// laufen Kompatibilität, Auto-Set und Timeline leer, deshalb rechnen wir sie
// auf Wunsch selbst aus. Ergebnisse werden als Schätzung markiert — Traktors
// eigene Werte haben immer Vorrang.
let analyzed = 0;
if (analyze) {
  const need = entries.filter((e) => !e.bpm || !e.key);
  if (!need.length) {
    log("Analyse: alle Tracks haben bereits BPM und Key.");
  } else {
    const cache = await loadAnalysisCache();
    const byFile = new Map(need.map((e) => [e.full, e]));

    // Schon Gerechnetes nicht noch einmal rechnen: bei ~3,5 s pro Track
    // kostet ein voller Durchlauf über die Sammlung Stunden, und ein
    // Re-Import ändert an der Musik nichts.
    const fresh = [];
    const results = [];
    for (const [full, e] of byFile) {
      const hit = cache.get(await cacheKey(full, e));
      if (hit) results.push({ ...hit, file: full });
      else fresh.push(full);
    }
    if (results.length) log(`Analyse: ${results.length} aus dem Cache.`);
    if (fresh.length) {
      log(`Analyse: ${fresh.length} Track${fresh.length === 1 ? "" : "s"} ohne BPM/Key …`);
      const computed = await runAnalyzer(fresh);
      results.push(...computed);
      for (const r of computed) {
        if (r.error) continue;
        const e = byFile.get(r.file);
        if (e) cache.set(await cacheKey(r.file, e), r);
      }
      await saveAnalysisCache(cache);
    }

    for (const r of results) {
      const e = byFile.get(r.file);
      if (!e || r.error) {
        if (r.error) log(`  ${basename(r.file)} — Analyse fehlgeschlagen: ${r.error}`);
        continue;
      }
      // Der Raster-Anker wandert mit in die NML: ohne ihn ist ein BPM-Wert
      // nur eine Zahl, mit ihm ein Beatgrid. nml.ts liest ihn als CUE_V2
      // TYPE=4 wieder ein, der Export gibt ihn an Traktor weiter.
      if (r.grid_ms != null) e.gridMs = r.grid_ms;
      if (!e.bpm && r.bpm) {
        e.bpm = r.bpm;
        e.bpmEstimated = true;
        // BPM_QUALITY ist Traktors Verlässlichkeitsfeld; 100 steht dort für
        // "gemessen und sicher". Ein geschätzter Wert darf das nie behaupten,
        // auch wenn die Analyse-Fenster sich einig waren — Einigkeit ist nicht
        // Richtigkeit: ein Oktavfehler ist über den ganzen Track stabil.
        // Deshalb gedeckelt, damit Geschätztes auch numerisch unter Gemessenem
        // bleibt.
        e.bpmQuality = Math.round((r.bpm_confidence ?? 0) * ESTIMATED_QUALITY_CAP);
        withBpm++;
      }
      if (!e.key && r.camelot) {
        // Camelot-Code direkt: toCamelot() erkennt ihn ohne Umweg.
        e.key = r.camelot;
        e.keyEstimated = true;
        withKey++;
      }
      analyzed++;
    }
    log(`Analyse: ${analyzed}/${need.length} Tracks ergänzt.`);
  }
}

function entryXml(e) {
  const albumNode = e.album ? `\n    <ALBUM TITLE="${esc(e.album)}"></ALBUM>` : "";
  // ESTIMATED ist unsere eigene Erweiterung (wie COVERART/AUDIO/FOLDER) und
  // sagt, welche Felder gerechnet statt gelesen sind.
  const estimated = [e.bpmEstimated && "bpm", e.keyEstimated && "key"].filter(Boolean).join(" ");
  const infoAttrs = [
    e.genre && `GENRE="${esc(e.genre)}"`,
    e.key && `KEY="${esc(e.key)}"`,
    e.dur && `PLAYTIME="${e.dur}"`,
    e.bitrate && `BITRATE="${e.bitrate}"`,
    e.sampleRate && `SAMPLERATE="${e.sampleRate}"`,
    `LOSSLESS="${e.lossless}"`,
    estimated && `ESTIMATED="${estimated}"`,
    e.deepAttrs,
  ]
    .filter(Boolean)
    .join(" ");
  const tempoNode = e.bpm
    ? `\n    <TEMPO BPM="${Number(e.bpm).toFixed(6)}" BPM_QUALITY="${Number(e.bpmQuality ?? 0).toFixed(6)}"></TEMPO>`
    : "";

  // Grid-Anker als CUE_V2 TYPE=4 — dieselbe Form, die Traktor selbst schreibt
  // (Name "AutoGrid", kein Slot, keine Laenge). Aus 679 echten Cues abgeleitet.
  const gridNode =
    e.gridMs != null && e.bpm
      ? `\n    <CUE_V2 NAME="AutoGrid" DISPL_ORDER="0" TYPE="4" START="${Number(e.gridMs).toFixed(6)}" LEN="0.000000" REPEATS="-1" HOTCUE="-1"></CUE_V2>`
      : "";

  // FOLDER ist unsere eigene Erweiterung (wie COVERART/AUDIO) und trägt das
  // Gruppen-Label für die Library-Ansicht.
  return (
    `  <ENTRY TITLE="${esc(e.title)}" ARTIST="${esc(e.artist)}"${e.coverAttr}${e.audioAttr} FOLDER="${esc(e.folder)}">` +
    `\n    <LOCATION DIR="${esc(e.fileDir)}/" FILE="${esc(e.fileName)}" VOLUME=""></LOCATION>` +
    albumNode +
    `\n    <INFO ${infoAttrs}></INFO>` +
    tempoNode +
    gridNode +
    `\n  </ENTRY>`
  );
}

const xml =
  `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n` +
  `<NML VERSION="19">\n` +
  `<HEAD COMPANY="www.native-instruments.com" PROGRAM="Traktor"></HEAD>\n` +
  `<MUSICFOLDERS></MUSICFOLDERS>\n` +
  `<COLLECTION ENTRIES="${entries.length}">\n` +
  entries.map(entryXml).join("\n") +
  `\n</COLLECTION>\n</NML>\n`;

await writeFile(join(publicDir, "collection.local.nml"), xml);

console.log(`Importiert: ${entries.length} Tracks → public/collection.local.nml`);
console.log(`Cover: ${withCover}/${entries.length} · BPM: ${withBpm} · Key: ${withKey}`);
if (deep) console.log(`Deep-Scan (LUFS/Peak/HF): ${deepOk}/${entries.length}`);
if (analyze) console.log(`Analysiert (geschätzte Werte): ${analyzed}`);
