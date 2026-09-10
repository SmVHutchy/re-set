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
import {
  BITRATES,
  ENGINE_LABEL,
  FORMATS,
  buildCommand,
  resolveEngine,
} from "./download.mjs";
import {
  findCollection,
  isTraktorRunning,
  schreibeDatei,
  schreibePlaylists,
  vorhandenePlaylists,
} from "./traktor-write.mjs";

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
  const { folder, deep, analyze } = req.body ?? {};
  if (!folder || typeof folder !== "string" || !fs.existsSync(folder)) {
    return res.status(400).json({ error: "Ordner nicht gefunden" });
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  const send = (obj) => res.write(JSON.stringify(obj) + "\n");

  // spawn mit Argument-Array (kein Shell) → keine Injection, kein Pfad-Quoting.
  const args = [IMPORT_SCRIPT, folder];
  if (deep) args.push("--deep");
  if (analyze) args.push("--analyze");
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

// ---- Downloads --------------------------------------------------------------
// Bisher lief das Herunterladen in einem eigenen Python-Dashboard, das Planen
// hier — zwei Fenster für einen Arbeitsgang. Der Server startet die Engines
// jetzt selbst als Kindprozess, mit demselben NDJSON-Live-Log wie der Import.
const DOWNLOAD_ROOT =
  process.env.DOWNLOAD_PATH || path.join(os.homedir(), "Music", "Re-SET Downloads");

// Genau ein Download gleichzeitig: parallele Läufe sättigen die Platte, und die
// Engines schreiben ohnehin in dieselben Ordner. Wartende Aufträge halten ihre
// Verbindung offen und bekommen ihre Position gemeldet.
const queue = [];
let active = null;
let jobCounter = 0;

function jobView(j) {
  return {
    id: j.id,
    url: j.url,
    engine: j.engine,
    format: j.format,
    state: j.state,
    startedAt: j.startedAt ?? null,
  };
}

app.get("/api/jobs", (_req, res) => {
  res.json({ active: active ? jobView(active) : null, queued: queue.map(jobView) });
});

app.delete("/api/jobs/:id", (req, res) => {
  const id = Number(req.params.id);
  if (active?.id === id) {
    active.cancelled = true;
    active.child?.kill();
    return res.json({ cancelled: "active" });
  }
  const i = queue.findIndex((j) => j.id === id);
  if (i === -1) return res.status(404).json({ error: "Auftrag nicht gefunden" });
  const [j] = queue.splice(i, 1);
  j.send({ type: "done", success: false, error: "abgebrochen" });
  j.res.end();
  res.json({ cancelled: "queued" });
});

app.post("/api/download", (req, res) => {
  const { url, source = "auto", format = "mp3", bitrate = "320k" } = req.body ?? {};
  if (typeof url !== "string" || !/^https?:\/\//i.test(url.trim())) {
    return res.status(400).json({ error: "Keine gültige URL" });
  }
  if (!FORMATS.includes(format) || !BITRATES.includes(bitrate)) {
    return res.status(400).json({ error: "Format oder Qualität unbekannt" });
  }
  const engine = resolveEngine(url.trim(), source);
  if (!engine) {
    return res.status(400).json({ error: "Quelle nicht erkannt — Engine manuell wählen" });
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");

  const job = {
    id: ++jobCounter,
    url: url.trim(),
    engine,
    format,
    bitrate,
    state: "queued",
    res,
    child: null,
    cancelled: false,
    send: (obj) => {
      if (!res.writableEnded) res.write(JSON.stringify(obj) + "\n");
    },
  };

  res.on("close", () => {
    // Verbindung weg, bevor wir fertig sind → wartenden Auftrag verwerfen bzw.
    // laufenden Prozess beenden. writableEnded-Guard, damit ein normal
    // beendeter Request nichts killt.
    if (res.writableEnded) return;
    if (active === job) {
      job.cancelled = true;
      job.child?.kill();
    } else {
      const i = queue.indexOf(job);
      if (i !== -1) queue.splice(i, 1);
    }
  });

  queue.push(job);
  if (active) job.send({ type: "queued", position: queue.length });
  pump();
});

function pump() {
  if (active || !queue.length) return;
  active = queue.shift();
  runJob(active);
}

function runJob(job) {
  job.state = "running";
  job.startedAt = Date.now();

  const plan = buildCommand({
    url: job.url,
    engine: job.engine,
    format: job.format,
    bitrate: job.bitrate,
    root: DOWNLOAD_ROOT,
  });
  if (!plan) {
    job.send({ type: "done", success: false, error: "Engine nicht unterstützt" });
    return finish(job);
  }

  fs.mkdirSync(plan.cwd, { recursive: true });
  job.send({ type: "start", engine: ENGINE_LABEL[job.engine], target: plan.targetDir });

  // spawn mit Argument-Array (kein Shell) → keine Injection über die URL, kein
  // Pfad-Quoting. Dieselbe Form wie beim Import.
  const child = spawn(plan.cmd, plan.args, { cwd: plan.cwd });
  job.child = child;

  let buf = "";
  const onChunk = (chunk) => {
    buf += chunk.toString();
    // \r trennt auch: die Engines schreiben Fortschritt mit Wagenrücklauf.
    const lines = buf.split(/\r?\n|\r/);
    buf = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) job.send({ type: "log", msg: line });
  };
  child.stdout.on("data", onChunk);
  child.stderr.on("data", onChunk);

  child.on("error", (err) => {
    job.send({ type: "done", success: false, error: `${plan.cmd}: ${err.message}` });
    finish(job);
  });

  child.on("close", (code) => {
    if (buf.trim()) job.send({ type: "log", msg: buf });
    const ok = code === 0 && !job.cancelled;
    if (ok) {
      // Der Zielordner wird sofort Musik-Quelle — sonst müsste der Nutzer den
      // Pfad, den wir gerade selbst gewählt haben, von Hand nachtragen.
      if (!musicSources.includes(plan.targetDir)) {
        musicSources.push(plan.targetDir);
        saveSources();
        rebuildIndex();
      }
      if (plan.convertTo) {
        job.send({
          type: "log",
          msg: `Hinweis: ${plan.convertTo.toUpperCase()} muss noch per ffmpeg erzeugt werden.`,
        });
      }
    }
    job.send({
      type: "done",
      success: ok,
      code,
      cancelled: job.cancelled,
      targetDir: plan.targetDir,
    });
    finish(job);
  });
}

function finish(job) {
  job.state = "done";
  if (!job.res.writableEnded) job.res.end();
  if (active === job) active = null;
  pump();
}

// ---- Uebergabe: Ordner auf der Platte schreiben ----------------------------
// Die Ordnung der Sammlung liegt im Dateisystem, nicht in Traktors Playlists:
// 90 Ordner, darin pre/mid/peak/late. Genau das legt diese Station an — was
// bisher von Hand passierte.
//
// Zwei Festlegungen, die aus dem beobachteten Ablauf folgen:
//   * Es wird KOPIERT, nicht verschoben. 339 Dateien liegen ohnehin in zwei
//     bis fuenf Ordnern; ein Track gehoert in ein Set, ohne aus seinem Crate
//     zu verschwinden.
//   * Es wird NIE ueberschrieben und NIE geloescht. Existiert die Zieldatei
//     schon, wird sie gemeldet und uebersprungen.
const PHASE_DIRS = new Set(["pre", "mid", "peak", "late"]);

/** Liegt `ziel` wirklich unterhalb von `wurzel`? Schutz vor ".." im Namen. */
function liegtUnter(wurzel, ziel) {
  const rel = path.relative(path.resolve(wurzel), path.resolve(ziel));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** Dateinamen von allem befreien, was Windows oder Traktor stoert. */
function sicherName(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\.+$/, "")
    .slice(0, 180);
}

/**
 * Plant die Kopien, ohne etwas anzufassen. Antwort ist die Vorschau, die der
 * Nutzer sieht, bevor irgendetwas passiert — und zugleich die Liste, die
 * `apply` ausfuehrt. Was hier nicht drinsteht, wird nicht geschrieben.
 */
app.post("/api/handoff/plan", (req, res) => {
  const { setName, targetRoot, items } = req.body ?? {};
  if (!setName || typeof setName !== "string") {
    return res.status(400).json({ error: "Kein Set-Name" });
  }
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: "Keine Tracks" });
  }

  const wurzel = path.resolve(targetRoot || path.join(DOWNLOAD_ROOT, sicherName(setName)));
  const ops = [];
  const probleme = [];

  for (const it of items) {
    const quelle = typeof it?.path === "string" ? it.path : null;
    const phase = PHASE_DIRS.has(it?.phase) ? it.phase : null;
    if (!quelle) {
      probleme.push({ grund: "kein Pfad", titel: it?.title ?? "?" });
      continue;
    }
    if (!fs.existsSync(quelle)) {
      probleme.push({ grund: "Datei nicht gefunden", titel: it?.title ?? path.basename(quelle) });
      continue;
    }
    // Ohne Phase in den Wurzelordner — besser als gar nicht uebergeben.
    const unterordner = phase ?? "ohne Phase";
    const ziel = path.join(wurzel, unterordner, sicherName(path.basename(quelle)));
    if (!liegtUnter(wurzel, ziel)) {
      probleme.push({ grund: "Ziel ausserhalb des Ordners", titel: path.basename(quelle) });
      continue;
    }
    let groesse = 0;
    try {
      groesse = fs.statSync(quelle).size;
    } catch {
      /* Groesse ist nur Anzeige */
    }
    ops.push({
      von: quelle,
      nach: ziel,
      phase: unterordner,
      groesse,
      existiert: fs.existsSync(ziel),
    });
  }

  const neu = ops.filter((o) => !o.existiert);
  res.json({
    wurzel,
    ops,
    probleme,
    zusammenfassung: {
      gesamt: ops.length,
      neu: neu.length,
      vorhanden: ops.length - neu.length,
      bytes: neu.reduce((s, o) => s + o.groesse, 0),
      ordner: [...new Set(ops.map((o) => o.phase))],
    },
  });
});

/**
 * Fuehrt einen zuvor angezeigten Plan aus. `confirm` ist Pflicht: es soll
 * nicht moeglich sein, Dateien zu schreiben, ohne die Vorschau gesehen zu
 * haben. Fortschritt kommt als NDJSON wie bei Import und Download.
 */
app.post("/api/handoff/apply", (req, res) => {
  const { wurzel, ops, confirm } = req.body ?? {};
  if (confirm !== true) return res.status(400).json({ error: "Nicht bestaetigt" });
  if (!wurzel || !Array.isArray(ops) || !ops.length) {
    return res.status(400).json({ error: "Kein Plan" });
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  const send = (o) => {
    if (!res.writableEnded) res.write(JSON.stringify(o) + "\n");
  };

  const basis = path.resolve(wurzel);
  let kopiert = 0;
  let uebersprungen = 0;
  let fehler = 0;

  send({ type: "log", msg: `Ziel: ${basis}` });

  for (const [i, o] of ops.entries()) {
    const ziel = path.resolve(String(o?.nach ?? ""));
    const quelle = String(o?.von ?? "");
    // Jede einzelne Kopie noch einmal pruefen — der Plan kam vom Client.
    if (!liegtUnter(basis, ziel)) {
      fehler++;
      send({ type: "log", msg: `[${i + 1}/${ops.length}] abgelehnt (ausserhalb): ${o?.nach}` });
      continue;
    }
    if (!fs.existsSync(quelle)) {
      fehler++;
      send({ type: "log", msg: `[${i + 1}/${ops.length}] Quelle fehlt: ${quelle}` });
      continue;
    }
    if (fs.existsSync(ziel)) {
      uebersprungen++;
      send({ type: "log", msg: `[${i + 1}/${ops.length}] liegt schon da: ${path.basename(ziel)}` });
      continue;
    }
    try {
      fs.mkdirSync(path.dirname(ziel), { recursive: true });
      // COPYFILE_EXCL: schlaegt fehl, statt eine vorhandene Datei zu
      // ueberschreiben — auch wenn sie zwischen Pruefung und Kopie entsteht.
      fs.copyFileSync(quelle, ziel, fs.constants.COPYFILE_EXCL);
      kopiert++;
      send({ type: "log", msg: `[${i + 1}/${ops.length}] ${path.basename(ziel)}` });
    } catch (err) {
      fehler++;
      send({ type: "log", msg: `[${i + 1}/${ops.length}] Fehler: ${err.message}` });
    }
  }

  // Der neue Gig-Ordner wird sofort Musik-Quelle, damit er ohne Zutun in der
  // Bibliothek auftaucht.
  if (kopiert && !musicSources.includes(basis)) {
    musicSources.push(basis);
    saveSources();
    rebuildIndex();
    send({ type: "log", msg: "Ordner als Musik-Quelle eingetragen." });
  }

  send({ type: "done", success: fehler === 0, kopiert, uebersprungen, fehler, wurzel: basis });
  res.end();
});

// ---- Write-Back nach Traktor ------------------------------------------------
// Schreibt die Phasen als Playlists direkt in die collection.nml, statt eine
// Datei zum Importieren zu erzeugen. Das ist der riskanteste Teil der ganzen
// Anwendung — hier liegen Jahre Analysearbeit —, deshalb vier Sicherungen:
//
//   1. Traktor darf nicht laufen. Es haelt die Collection im Speicher und
//      ueberschreibt beim Beenden alles, was wir inzwischen geschrieben haben.
//   2. Sicherung vor jedem Schreibvorgang, mit Zeitstempel, nie ueberschrieben.
//   3. Atomar: temporaere Datei, dann umbenennen. Ein Absturz mittendrin
//      hinterlaesst nie eine halbe Collection.
//   4. Vorhandene <ENTRY> werden nie angefasst — nur neue kommen dazu.
app.get("/api/traktor/status", (_req, res) => {
  const datei = findCollection();
  if (!datei) {
    return res.json({ gefunden: false, hinweis: "Keine collection.nml gefunden." });
  }
  let stat = null;
  try {
    stat = fs.statSync(datei);
  } catch {
    /* gleich als nicht lesbar melden */
  }
  const laeuft = isTraktorRunning();
  res.json({
    gefunden: true,
    datei,
    groesse: stat?.size ?? 0,
    geaendert: stat ? new Date(stat.mtimeMs).toISOString() : null,
    traktorLaeuft: laeuft,
    schreibbar: !laeuft && !!stat,
    hinweis: laeuft ? "Traktor läuft — bitte beenden, sonst geht das Geschriebene verloren." : null,
  });
});

/** Gemeinsame Vorbereitung für Vorschau und Schreiben. */
function planeWriteBack(body) {
  const { setName, gruppen, opt, collectionPath } = body ?? {};
  if (!setName || typeof setName !== "string") throw new Error("Kein Set-Name");
  if (!Array.isArray(gruppen) || !gruppen.length) throw new Error("Keine Phasen");

  const datei = collectionPath || findCollection();
  if (!datei || !fs.existsSync(datei)) throw new Error("collection.nml nicht gefunden");

  const xml = fs.readFileSync(datei, "utf-8");
  const ergebnis = schreibePlaylists(xml, {
    setName,
    gruppen,
    opt: { grid: opt?.grid !== false, sperren: opt?.sperren === true },
  });
  return { datei, xml, ergebnis };
}

app.post("/api/traktor/dry-run", (req, res) => {
  try {
    const { datei, xml, ergebnis } = planeWriteBack(req.body);
    const namen = new Set(vorhandenePlaylists(xml));
    const kollisionen = (req.body.gruppen ?? [])
      .map((g) => `${req.body.setName} ${g.label}`)
      .filter((n) => namen.has(n));

    res.json({
      datei,
      traktorLaeuft: isTraktorRunning(),
      neu: ergebnis.neu,
      schonVorhanden: ergebnis.schonVorhanden,
      playlists: ergebnis.playlists,
      mitGrid: ergebnis.mitGrid,
      kollisionen,
      // Groessendifferenz als grobe Plausibilitaetspruefung fuer den Nutzer:
      // wenn hier Megabytes stehen, stimmt etwas nicht.
      waechstUm: ergebnis.xml.length - xml.length,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/traktor/write", (req, res) => {
  if (req.body?.confirm !== true) {
    return res.status(400).json({ error: "Nicht bestätigt" });
  }
  if (isTraktorRunning()) {
    return res.status(409).json({
      error: "Traktor läuft. Bitte beenden — sonst überschreibt Traktor das Geschriebene.",
    });
  }
  try {
    const { datei, ergebnis } = planeWriteBack(req.body);
    const sicherung = schreibeDatei(datei, ergebnis.xml);
    res.json({
      ok: true,
      datei,
      sicherung,
      neu: ergebnis.neu,
      schonVorhanden: ergebnis.schonVorhanden,
      playlists: ergebnis.playlists,
      mitGrid: ergebnis.mitGrid,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
