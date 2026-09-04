import { useEffect, useRef, useState } from "react";
import { CloudArrowDown, Prohibit } from "@phosphor-icons/react";
import { toast } from "../lib/toast";
import { streamNdjson } from "../lib/ndjson";

type Source = "auto" | "spotdl" | "soundcloud" | "streamrip";

const SOURCES: Array<{ value: Source; label: string }> = [
  { value: "auto", label: "Automatisch" },
  { value: "spotdl", label: "Spotify" },
  { value: "soundcloud", label: "SoundCloud" },
  { value: "streamrip", label: "Tidal · Qobuz · Deezer" },
];

const FORMATS = ["mp3", "flac", "wav", "aiff"] as const;
const BITRATES = ["320k", "256k"] as const;

// Spotify und SoundCloud liefern an der Quelle verlustbehaftetes Audio. Ein
// Export als FLAC/WAV/AIFF macht die Datei nur größer, nicht besser — das
// gehört an die Stelle, an der man das Format wählt, nicht in ein Handbuch.
const FORMAT_NOTE: Record<string, string> = {
  mp3: "Standard fürs Auflegen: überall kompatibel, saubere Tags, Traktor liest BPM und Key problemlos.",
  flac: "Nur bei echten Lossless-Quellen (Tidal · Qobuz · Deezer) ein Gewinn. Aus Spotify oder SoundCloud nur größer.",
  wav: "Traktor spielt es, speichert aber kaum Tags — schlecht für die Bibliothek. FLAC ist meist die bessere Wahl.",
  aiff: "Unkomprimiert mit Tags. Große Dateien, aus verlustbehafteter Quelle ohne Gewinn.",
};

interface Job {
  id: number;
  url: string;
  engine: string;
  state: string;
}

export function DownloadPanel() {
  const [url, setUrl] = useState("");
  const [source, setSource] = useState<Source>("auto");
  const [format, setFormat] = useState<string>("mp3");
  const [bitrate, setBitrate] = useState<string>("320k");
  const [running, setRunning] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [targetDir, setTargetDir] = useState<string | null>(null);
  const [queued, setQueued] = useState<Job[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logLines]);

  // Warteschlange nur nachfragen, solange etwas läuft — ein stiller Poller im
  // Leerlauf bringt nichts.
  useEffect(() => {
    if (!running) return;
    const tick = () =>
      fetch("/api/jobs")
        .then((r) => r.json())
        .then((d) => setQueued(d.queued ?? []))
        .catch(() => {});
    tick();
    const t = setInterval(tick, 4000);
    return () => clearInterval(t);
  }, [running]);

  const start = async () => {
    if (!url.trim()) {
      toast("Bitte eine URL einfügen");
      return;
    }
    setRunning(true);
    setLogLines([]);
    setTargetDir(null);
    try {
      const result = await streamNdjson("/api/download", { url, source, format, bitrate }, (evt) => {
        if (evt.type === "log") setLogLines((prev) => [...prev, String(evt.msg)]);
        else if (evt.type === "queued")
          setLogLines((prev) => [...prev, `Wartet — Position ${evt.position}`]);
        else if (evt.type === "start")
          setLogLines((prev) => [...prev, `${evt.engine} · Ziel: ${evt.target}`]);
      });
      if (result.error) {
        toast(result.error);
        return;
      }
      if (result.ok) {
        setTargetDir(String(result.done?.targetDir ?? ""));
        setLogLines((prev) => [...prev, "Fertig. Der Ordner ist jetzt als Musik-Quelle eingetragen."]);
        toast("Download fertig");
      } else if (result.done?.cancelled) {
        toast("Abgebrochen");
      } else {
        toast(result.done?.error ? String(result.done.error) : "Download fehlgeschlagen");
      }
    } catch {
      toast("Netzwerkfehler");
    } finally {
      setRunning(false);
    }
  };

  const cancel = async (id?: number) => {
    try {
      const jobs = await fetch("/api/jobs").then((r) => r.json());
      const target = id ?? jobs.active?.id;
      if (target == null) return;
      await fetch(`/api/jobs/${target}`, { method: "DELETE" });
    } catch {
      toast("Abbrechen fehlgeschlagen");
    }
  };

  return (
    <div className="view-fade mt-7 flex flex-col gap-6 lg:max-w-2xl">
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-1 text-sm font-medium text-ink">Musik laden</h2>
        <p className="mb-4 text-xs text-ink-soft">
          Song, Album oder Playlist. Der Playlist-Name wird zum Ordnernamen und damit zur Gruppe in
          der Bibliothek.
        </p>

        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !running) start();
          }}
          disabled={running}
          placeholder="https://open.spotify.com/playlist/… oder https://soundcloud.com/…"
          className="mb-3 h-9 w-full rounded-md border border-line bg-base px-3 text-[12px] text-ink placeholder:text-ink-faint disabled:opacity-50"
        />

        <div className="mb-3 flex flex-wrap gap-2">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as Source)}
            disabled={running}
            className="h-8 rounded-md border border-line bg-base px-2 text-[12px] text-ink-soft disabled:opacity-50"
          >
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            disabled={running}
            className="h-8 rounded-md border border-line bg-base px-2 text-[12px] text-ink-soft disabled:opacity-50"
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f.toUpperCase()}
              </option>
            ))}
          </select>

          {format === "mp3" && (
            <select
              value={bitrate}
              onChange={(e) => setBitrate(e.target.value)}
              disabled={running}
              className="h-8 rounded-md border border-line bg-base px-2 text-[12px] text-ink-soft disabled:opacity-50"
            >
              {BITRATES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}
        </div>

        <p className="mb-4 text-[11px] leading-relaxed text-ink-faint">{FORMAT_NOTE[format]}</p>

        <div className="flex items-center gap-2">
          <button
            onClick={start}
            disabled={running}
            className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-[12px] font-medium text-base disabled:opacity-50"
          >
            <CloudArrowDown size={14} weight="regular" />
            {running ? "Lädt …" : "Download"}
          </button>
          {running && (
            <button
              onClick={() => cancel()}
              className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[12px] text-ink-soft hover:text-ink transition-colors"
            >
              <Prohibit size={14} weight="regular" /> Abbrechen
            </button>
          )}
        </div>

        {queued.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <div className="mb-1.5 text-[11px] font-medium text-ink-soft">
              Warteschlange ({queued.length})
            </div>
            {queued.map((j) => (
              <div key={j.id} className="flex items-center justify-between gap-2 py-0.5">
                <span className="truncate font-mono text-[10px] text-ink-faint">{j.url}</span>
                <button
                  onClick={() => cancel(j.id)}
                  className="shrink-0 text-[10px] text-ink-faint hover:text-ink transition-colors"
                >
                  entfernen
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {logLines.length > 0 && (
        <section className="rounded-lg border border-line bg-surface p-5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium text-ink-soft">Live-Log</span>
            <span className="font-mono text-[10px] text-ink-faint">{logLines.length} Zeilen</span>
          </div>
          <div
            ref={logRef}
            className="max-h-72 overflow-y-auto rounded-md border border-line bg-base p-2.5 font-mono text-[10px] leading-relaxed text-ink-faint"
          >
            {logLines.map((l, i) => (
              <div key={i} className="truncate">
                {l}
              </div>
            ))}
          </div>
          {targetDir && (
            <p className="mt-3 text-[11px] text-ink-soft">
              Weiter mit <span className="text-ink">Import</span> oben — der Ordner steht dort schon
              zur Auswahl.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
