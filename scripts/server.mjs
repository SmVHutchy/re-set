// Ein einziger Origin für alles: baut die SPA (dist/) aus, liefert die zur
// Laufzeit importierten Assets (public/: collection.local.nml, covers/, audio/)
// und stellt die Import-API bereit. So funktioniert /api/* ohne Proxy und die
// frisch importierte Library ist sofort unter demselben Host erreichbar.
import express from "express";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { parseFile } from "music-metadata";

const app = express();
app.use(express.json());

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const DIST_DIR = path.join(ROOT, "dist");
const INDEX_HTML = path.join(DIST_DIR, "index.html");
const IMPORT_SCRIPT = path.join(ROOT, "scripts", "import-music.mjs");

// Jede hochgeladene NML = ein „Ordner" der Bibliothek. Sie sammeln sich hier,
// statt sich gegenseitig zu überschreiben — so wachsen mehrere Ordner an, die
// die App zusammenführt und getrennt auf-/zuklappen kann.
const COLLECTIONS_DIR = path.join(PUBLIC_DIR, "collections");
fs.mkdirSync(COLLECTIONS_DIR, { recursive: true });

// Konfigurierbare Musik-Quellen (MUSIC_PATH, komma-separiert). Default: ~/Music.
// Komma statt path.delimiter, weil Windows-Pfade ":" enthalten (C:\...).
const MUSIC_DIRS = (
  process.env.MUSIC_PATH ? process.env.MUSIC_PATH.split(",") : [path.join(os.homedir(), "Music")]
)
  .map((d) => d.trim())
  .filter(Boolean);

// Jede Quelle plus ihre direkten Unterordner anbieten, damit der Nutzer gezielt
// ein Genre-/Crate-Verzeichnis wählen kann statt nur die Wurzel.
function listFolders() {
  const out = [];
  for (const dir of MUSIC_DIRS) {
    if (!fs.existsSync(dir)) continue;
    out.push({ name: path.basename(dir) || dir, path: dir });
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // unlesbar → überspringen
    }
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith(".")) {
        out.push({ name: `${path.basename(dir)} / ${e.name}`, path: path.join(dir, e.name) });
      }
    }
  }
  return out;
}

app.get("/api/music-folders", (_req, res) => {
  res.json(listFolders());
});

// Import läuft als Kindprozess; jede Ausgabezeile wird sofort als NDJSON
// gestreamt, damit die UI live mitliest, was gerade analysiert wird.
app.post("/api/import", (req, res) => {
  const { folder, deep } = req.body ?? {};
  if (!folder || typeof folder !== "string" || !fs.existsSync(folder)) {
    return res.status(400).json({ error: "Ordner nicht gefunden" });
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  const send = (obj) => res.write(JSON.stringify(obj) + "\n");

  // spawn mit Argument-Array (kein Shell) → keine Injection, kein Pfad-Quoting.
  const args = [IMPORT_SCRIPT, folder];
  if (deep) args.push("--deep");
  const child = spawn(process.execPath, args, { cwd: ROOT });

  // stdout + stderr zeilenweise puffern und als Log-Events senden.
  let buf = "";
  const onChunk = (chunk) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) send({ type: "log", msg: line });
  };
  child.stdout.on("data", onChunk);
  child.stderr.on("data", onChunk);

  child.on("error", (err) => {
    send({ type: "done", success: false, error: err.message });
    res.end();
  });
  child.on("close", (code) => {
    if (buf.trim()) send({ type: "log", msg: buf });
    send({ type: "done", success: code === 0, code });
    res.end();
  });

  // Bricht der Client wirklich ab (Verbindung zu, bevor wir fertig sind),
  // Kindprozess beenden. res-'close' + writableEnded-Guard, damit ein normal
  // beendeter Request den laufenden Import nicht fälschlich killt.
  res.on("close", () => {
    if (!res.writableEnded && child.exitCode === null) child.kill();
  });
});

// Dateinamen aus einem Anzeigenamen ableiten und Kollisionen vermeiden.
function sanitizeCollectionName(n) {
  return (
    String(n || "Import")
      .replace(/\.nml$/i, "")
      .replace(/[^\w\- ]+/g, "_")
      .trim()
      .slice(0, 60) || "Import"
  );
}
function uniqueCollectionFile(name) {
  const base = sanitizeCollectionName(name);
  let file = `${base}.nml`;
  let i = 2;
  while (fs.existsSync(path.join(COLLECTIONS_DIR, file))) file = `${base} ${i++}.nml`;
  return file;
}

// Echte Traktor-.nml hochladen → als NEUEN Ordner zur Bibliothek HINZUFÜGEN
// (kein Überschreiben mehr). Der Anzeigename kommt aus dem Dateinamen (?name).
app.post("/api/upload-nml", express.text({ type: "*/*", limit: "128mb" }), (req, res) => {
  const xml = req.body;
  if (typeof xml !== "string" || !xml.includes("<NML")) {
    return res.status(400).json({ error: "Keine gültige .nml-Datei" });
  }
  try {
    const file = uniqueCollectionFile(req.query.name);
    fs.writeFileSync(path.join(COLLECTIONS_DIR, file), xml, "utf-8");
    res.json({ success: true, file: `collections/${file}`, name: file.replace(/\.nml$/i, "") });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Alle geladenen Ordner der Bibliothek auflisten (collections/* plus die alte
// Einzeldatei collection.local.nml, falls noch vorhanden).
app.get("/api/collections", (_req, res) => {
  const out = [];
  try {
    for (const f of fs.readdirSync(COLLECTIONS_DIR)) {
      // Dotfiles überspringen — macOS legt auf der externen Platte AppleDouble-
      // Dateien (._name.nml) an, die kein gültiges XML sind.
      if (f.startsWith(".")) continue;
      if (f.toLowerCase().endsWith(".nml")) {
        out.push({ file: `collections/${f}`, name: f.replace(/\.nml$/i, "") });
      }
    }
  } catch {
    // Verzeichnis leer/unlesbar → nur die Alt-Datei prüfen
  }
  if (fs.existsSync(path.join(PUBLIC_DIR, "collection.local.nml"))) {
    out.push({ file: "collection.local.nml", name: "Import (Alt)" });
  }
  res.json(out);
});

// Einen Ordner entfernen (Datei löschen). Nur collections/*.nml oder die
// Alt-Datei sind erlaubt — kein Ausbruch aus public/.
app.delete("/api/collections", (req, res) => {
  const file = String(req.query.file || "");
  const allowed = /^collections\/[^/]+\.nml$/.test(file) || file === "collection.local.nml";
  if (!allowed) return res.status(400).json({ error: "ungültiger Pfad" });
  try {
    fs.unlinkSync(path.join(PUBLIC_DIR, file));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Echte Traktor-Tracks tragen kein AUDIO-Attribut, nur LOCATION (Pfad auf der
// Platte). Der Browser darf Festplattenpfade nicht direkt abspielen — dieser
// Endpoint schlägt die Brücke: er rekonstruiert den echten Pfad aus Traktors
// VOLUME/:DIR/:FILE und streamt die Datei (mit Range-Support fürs Seeken).
const AUDIO_EXT = new Set([".mp3", ".wav", ".flac", ".aif", ".aiff", ".m4a", ".mp4", ".ogg", ".aac"]);
const AUDIO_MIME = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".aif": "audio/aiff",
  ".aiff": "audio/aiff",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".ogg": "audio/ogg",
  ".aac": "audio/aac",
};

// ---- Musik-Ordner für die Datei-Zuordnung ----------------------------------
// Die Platte wandert zwischen Mac und Windows → die LOCATION-Pfade der NML
// zeigen oft auf das jeweils andere System. Der Nutzer trägt deshalb in der
// App eigene Musik-Ordner ein; wir indizieren deren Dateinamen und lösen
// nicht auffindbare Traktor-Pfade über den Namen auf.
// Persistiert in .music-sources.json (Projekt-Root, nicht in public/).
const SOURCES_FILE = path.join(ROOT, ".music-sources.json");

function loadSources() {
  try {
    const arr = JSON.parse(fs.readFileSync(SOURCES_FILE, "utf-8"));
    return Array.isArray(arr) ? arr.filter((p) => typeof p === "string") : [];
  } catch {
    return []; // Datei fehlt/kaputt → keine Quellen
  }
}
let musicSources = loadSources();

function saveSources() {
  fs.writeFileSync(SOURCES_FILE, JSON.stringify(musicSources, null, 2));
}

// Dateiname (lowercase) → absoluter Pfad. Erster Treffer gewinnt (Quellen in
// Eintrags-Reihenfolge). Synchron ist ok: ein paar tausend Dateien sind in
// Sekunden durch, und es läuft nur beim Start und beim Hinzufügen.
let fileIndex = new Map();

function indexDir(dir, map, depth = 0) {
  if (depth > 12) return; // Schutz vor Zyklen / absurden Tiefen
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // unlesbar → überspringen
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue; // Dotfiles (auch macOS ._Appledouble)
    const full = path.join(dir, e.name);
    if (e.isDirectory()) indexDir(full, map, depth + 1);
    else if (AUDIO_EXT.has(path.extname(e.name).toLowerCase())) {
      const k = e.name.toLowerCase();
      if (!map.has(k)) map.set(k, full);
    }
  }
}

function rebuildIndex() {
  const map = new Map();
  for (const dir of musicSources) indexDir(dir, map);
  fileIndex = map;
  return map.size;
}
rebuildIndex();

app.get("/api/sources", (_req, res) => {
  res.json({ sources: musicSources, files: fileIndex.size });
});

app.post("/api/sources", (req, res) => {
  const p = String(req.body?.path || "").trim();
  if (!p) return res.status(400).json({ error: "Pfad fehlt" });
  let stat = null;
  try {
    stat = fs.statSync(p);
  } catch {
    // existiert nicht → unten 400
  }
  if (!stat?.isDirectory()) return res.status(400).json({ error: "Ordner nicht gefunden" });
  if (!musicSources.includes(p)) musicSources.push(p);
  saveSources();
  const files = rebuildIndex();
  res.json({ sources: musicSources, files });
});

app.delete("/api/sources", (req, res) => {
  const p = String(req.query.path || "");
  musicSources = musicSources.filter((x) => x !== p);
  saveSources();
  const files = rebuildIndex();
  res.json({ sources: musicSources, files });
});

// Traktor kodiert Verzeichnisse als "/:Users/:name/:Ordner/:". Wir lösen das zu
// echten Pfaden auf und probieren Boot-Volume (absolut ab /), Windows-Laufwerk
// (VOLUME="C:") sowie externe Volumes (/Volumes/<NAME> auf macOS) durch — der
// erste existierende gewinnt. Findet keiner die Datei, greift der Dateinamen-
// Index der eingetragenen Musik-Ordner (Platte wandert zwischen Mac/Windows).
function resolveTraktorPath(vol, dir, file) {
  const normDir = String(dir || "").replace(/\/:/g, "/");
  const name = String(file || "");
  if (!name) return null;
  const candidates = [
    path.join(normDir, name), // Boot-Volume / bereits absolut
  ];
  if (vol) {
    if (/^[A-Za-z]:$/.test(String(vol))) {
      candidates.push(path.join(String(vol), normDir, name)); // Windows-Laufwerk
    }
    candidates.push(path.join("/Volumes", String(vol), normDir, name)); // externes Volume (macOS)
  }
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch {
      // unlesbar → nächster Kandidat
    }
  }
  return fileIndex.get(name.toLowerCase()) ?? null;
}

app.get("/api/audio", (req, res) => {
  const { vol, dir, file } = req.query;
  const abs = resolveTraktorPath(vol, dir, file);
  if (!abs) return res.status(404).json({ error: "Audiodatei nicht gefunden" });
  const ext = path.extname(abs).toLowerCase();
  if (!AUDIO_EXT.has(ext)) return res.status(415).json({ error: "Kein Audioformat" });

  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    return res.status(404).json({ error: "Audiodatei nicht lesbar" });
  }

  const mime = AUDIO_MIME[ext] || "application/octet-stream";
  const range = req.headers.range;
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", mime);

  // Teil-Anfrage (Seeken im Player) → 206 mit dem angeforderten Byte-Bereich.
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
      if (start >= stat.size || end >= stat.size || start > end) {
        res.setHeader("Content-Range", `bytes */${stat.size}`);
        return res.status(416).end();
      }
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
      res.setHeader("Content-Length", end - start + 1);
      return fs.createReadStream(abs, { start, end }).pipe(res);
    }
  }

  res.setHeader("Content-Length", stat.size);
  fs.createReadStream(abs).pipe(res);
});

// Cover on-demand: echte Traktor-Tracks tragen kein COVERART, aber das Bild
// steckt in der MP3 (ID3). Wir lesen es aus der Datei am Pfad und cachen es im
// Speicher (Key = Pfad+mtime+size), damit dieselbe Datei nicht doppelt geparst
// wird. <img loading="lazy"> fragt nur sichtbare Cover an → skaliert auch groß.
const coverCache = new Map(); // absPath|mtime|size → { buf, type } | null (= kein Bild)

async function extractCover(abs, stat) {
  const key = `${abs}|${stat.mtimeMs}|${stat.size}`;
  if (coverCache.has(key)) return coverCache.get(key);
  let result = null;
  try {
    const { common } = await parseFile(abs, { duration: false });
    const pic = common.picture?.[0];
    if (pic) result = { buf: Buffer.from(pic.data), type: pic.format || "image/jpeg" };
  } catch {
    // unlesbar / kein Tag → kein Cover
  }
  coverCache.set(key, result);
  return result;
}

app.get("/api/cover", async (req, res) => {
  const { vol, dir, file } = req.query;
  const abs = resolveTraktorPath(vol, dir, file);
  if (!abs) return res.status(404).end();
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    return res.status(404).end();
  }
  const etag = `"${stat.mtimeMs}-${stat.size}"`;
  if (req.headers["if-none-match"] === etag) return res.status(304).end();

  const cover = await extractCover(abs, stat);
  if (!cover) return res.status(404).end(); // kein eingebettetes Bild → App zeigt getönte Kachel
  res.setHeader("Content-Type", cover.type);
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.setHeader("ETag", etag);
  res.end(cover.buf);
});

// Laufzeit-Assets (importierte Library) haben Vorrang vor der Build-Kopie in dist/.
app.use(express.static(PUBLIC_DIR));
app.use(express.static(DIST_DIR));

// SPA-Fallback: alles außer /api/* auf index.html (falls gebaut).
// Pfade mit Datei-Endung (z. B. /collection.local.nml, /covers/x.jpg) sind
// Asset-Anfragen — wenn express.static sie nicht fand, ehrlich 404 statt
// index.html liefern. Sonst parst die App HTML als XML („kein gültiges XML").
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  if (path.extname(req.path)) return res.status(404).end();
  if (!fs.existsSync(INDEX_HTML)) {
    return res.status(404).send("dist/ nicht gebaut — im Dev-Modus liefert Vite die SPA aus.");
  }
  res.sendFile(INDEX_HTML);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Re:SET-Server läuft auf http://localhost:${PORT}`);
  console.log(`Musik-Quellen: ${MUSIC_DIRS.join(", ") || "(keine)"}`);
});
