// Ein einziger Origin für alles: baut die SPA (dist/) aus, liefert die zur
// Laufzeit importierten Assets (public/: collection.local.nml, covers/, audio/)
// und stellt die Import-API bereit. So funktioniert /api/* ohne Proxy und die
// frisch importierte Library ist sofort unter demselben Host erreichbar.
import express from "express";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const app = express();
app.use(express.json());

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const DIST_DIR = path.join(ROOT, "dist");
const INDEX_HTML = path.join(DIST_DIR, "index.html");
const IMPORT_SCRIPT = path.join(ROOT, "scripts", "import-music.mjs");

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

// Echte Traktor-collection.nml direkt aus dem Browser hochladen → wird zur
// aktiven lokalen Library (überschreibt public/collection.local.nml).
app.post("/api/upload-nml", express.text({ type: "*/*", limit: "128mb" }), (req, res) => {
  const xml = req.body;
  if (typeof xml !== "string" || !xml.includes("<NML")) {
    return res.status(400).json({ error: "Keine gültige .nml-Datei" });
  }
  try {
    fs.writeFileSync(path.join(PUBLIC_DIR, "collection.local.nml"), xml, "utf-8");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Laufzeit-Assets (importierte Library) haben Vorrang vor der Build-Kopie in dist/.
app.use(express.static(PUBLIC_DIR));
app.use(express.static(DIST_DIR));

// SPA-Fallback: alles außer /api/* auf index.html (falls gebaut).
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
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
