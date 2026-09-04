// Baut die Download-Kommandos für spotdl, yt-dlp und streamrip.
//
// Die Engines und ihre Format-/Qualitätsmatrix stammen aus dem SpotifyDL-
// Dashboard (dashboard.py, build_command) — dort sind sie erprobt, hier werden
// sie nur übernommen und um einen Punkt ergänzt: der Playlist-Name wird zum
// Ordnernamen. Genau dieser Ordner ist später das FOLDER-Gruppenlabel, das
// import-music.mjs in die NML schreibt, damit Download und Bibliothek ohne
// Zusatzlogik ineinandergreifen.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const IS_WIN = process.platform === "win32";
const EXE = IS_WIN ? ".exe" : "";

// Die Werkzeuge liegen im venv, das SpotifyDL beim ersten Start anlegt.
// Reihenfolge: ausdrücklich gesetzter Pfad, dann das Standard-venv, dann PATH.
const VENV_BIN = process.env.SPOTIFYDL_VENV
  ? path.join(process.env.SPOTIFYDL_VENV, IS_WIN ? "Scripts" : "bin")
  : path.join(os.homedir(), ".spotifydl", "venv", IS_WIN ? "Scripts" : "bin");

export function toolPath(name) {
  const inVenv = path.join(VENV_BIN, name + EXE);
  return fs.existsSync(inVenv) ? inVenv : name; // sonst auf den PATH vertrauen
}

export const FORMATS = ["mp3", "flac", "wav", "aiff"];
export const BITRATES = ["320k", "256k"];

/** Engine anhand der URL. Leerer String = unbekannte Quelle. */
export function urlEngine(url) {
  const u = String(url || "").toLowerCase();
  if (u.includes("spotify.com") || u.startsWith("spotify:")) return "spotdl";
  if (u.includes("soundcloud.com")) return "ytdlp";
  if (["qobuz.com", "tidal.com", "deezer.com", "deezer.page.link"].some((s) => u.includes(s))) {
    return "streamrip";
  }
  return "";
}

/** `source` aus der UI: "auto" | "spotdl" | "soundcloud" | "streamrip". */
export function resolveEngine(url, source) {
  if (source === "spotdl") return "spotdl";
  if (source === "soundcloud") return "ytdlp";
  if (source === "streamrip") {
    const e = urlEngine(url);
    return e === "ytdlp" ? "ytdlp" : "streamrip";
  }
  return urlEngine(url);
}

export const ENGINE_LABEL = {
  spotdl: "spotdl (Spotify)",
  ytdlp: "yt-dlp (SoundCloud)",
  streamrip: "streamrip (Tidal/Qobuz/Deezer)",
};

/**
 * Liefert `{ cmd, args, cwd, targetDir, convertTo }`.
 *
 * `targetDir` ist der Ordner, der danach als Musik-Quelle registriert wird —
 * nicht zwingend `cwd`, weil jede Engine woanders ablegt.
 * `convertTo` ist gesetzt, wenn das Zielformat erst per ffmpeg entsteht
 * (spotdl und yt-dlp können kein AIFF).
 */
export function buildCommand({ url, engine, format, bitrate, root }) {
  const downloads = root;

  if (engine === "spotdl") {
    let base = format;
    let convertTo = null;
    if (format === "aiff") {
      base = "wav";
      convertTo = "aiff";
    }
    // Playlists und Alben in einen eigenen Unterordner, Einzeltracks flach.
    const isList = url.includes("/playlist/") || url.includes("/album/");
    const out = isList
      ? "Spotify/{list-name}/{artists} - {title}.{output-ext}"
      : "Spotify/{artists} - {title}.{output-ext}";
    const args = ["download", url, "--output", out, "--format", base];
    if (base === "mp3") args.push("--bitrate", bitrate);
    return {
      cmd: toolPath("spotdl"),
      args,
      cwd: downloads,
      targetDir: path.join(downloads, "Spotify"),
      convertTo,
    };
  }

  if (engine === "ytdlp") {
    let base = format;
    let convertTo = null;
    if (format === "aiff") {
      base = "wav";
      convertTo = "aiff";
    }
    const scDir = path.join(downloads, "SoundCloud");
    fs.mkdirSync(scDir, { recursive: true });
    // %(playlist_title|Einzelne Tracks)s: liefert die Quelle keinen Listen-
    // namen (Einzeltrack, private Liste), greift der Ersatzname — nichts landet
    // flach im Wurzelordner.
    const args = [
      url,
      "-x",
      "--audio-format",
      base,
      "--embed-thumbnail",
      "--embed-metadata",
      "--add-metadata",
      "--windows-filenames",
      "--ignore-errors",
      "--no-warnings",
      "--no-progress",
      "--download-archive",
      path.join(scDir, ".archive.txt"),
      "-o",
      "%(playlist_title|Einzelne Tracks)s/%(uploader)s - %(title)s.%(ext)s",
    ];
    if (base === "mp3") args.push("--audio-quality", bitrate.toUpperCase());
    return { cmd: toolPath("yt-dlp"), args, cwd: scDir, targetDir: scDir, convertTo };
  }

  if (engine === "streamrip") {
    let codec = "FLAC";
    let quality = "3";
    let convertTo = null;
    if (format === "mp3") {
      codec = "MP3";
      quality = "1";
    } else if (format !== "flac") {
      convertTo = format; // wav/aiff entstehen per ffmpeg aus FLAC
    }
    const args = [];
    const config = process.env.STREAMRIP_CONFIG;
    if (config && fs.existsSync(config)) args.push("--config-path", config);
    args.push("-f", downloads, "-c", codec, "-q", quality, "--no-progress", "url", url);
    return { cmd: toolPath("rip"), args, cwd: downloads, targetDir: downloads, convertTo };
  }

  return null;
}
