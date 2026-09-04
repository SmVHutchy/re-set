import { useEffect, useState } from "react";
import { Folder, MagnifyingGlass, Trash, X } from "@phosphor-icons/react";
import { toast } from "../lib/toast";

interface Collection {
  file: string;
  name: string;
}

interface SourcesInfo {
  sources: string[];
  files: number;
}

// Verwaltung der geladenen Bibliotheks-Ordner: sehen, einzeln entfernen, alle
// leeren. Uploads fügen HINZU (siehe UploadNmlButton) — hier räumt man auf.
// Dazu: Musik-Ordner fürs Datei-Matching (Cover & Vorhören, wenn die NML auf
// Pfade eines anderen Rechners zeigt).
export function LibraryManager({ onClose }: { onClose: () => void }) {
  const [cols, setCols] = useState<Collection[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [sources, setSources] = useState<SourcesInfo | null>(null);
  const [newPath, setNewPath] = useState("");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    fetch("/api/collections")
      .then((r) => (r.ok ? r.json() : []))
      .then((c: Collection[]) => setCols(c))
      .catch(() => setCols([]));
    fetch("/api/sources")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: SourcesInfo | null) => setSources(s))
      .catch(() => setSources(null));
  }, []);

  // Musik-Ordner eintragen → Server scannt Dateinamen → Cover/Preview matchen.
  // Reload danach, damit bereits fehlgeschlagene <img>-Cover neu anfragen.
  const addSource = async () => {
    const p = newPath.trim();
    if (!p || scanning) return;
    setScanning(true);
    try {
      const r = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: p }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast(data.error || "Ordner nicht gefunden");
        setScanning(false);
        return;
      }
      toast(`${data.files} Audio-Dateien zugeordnet`);
      setTimeout(() => window.location.reload(), 700);
    } catch {
      toast("Import-Server nicht erreichbar");
      setScanning(false);
    }
  };

  const removeSource = async (p: string) => {
    setScanning(true);
    try {
      const r = await fetch(`/api/sources?path=${encodeURIComponent(p)}`, { method: "DELETE" });
      const data = await r.json();
      setSources(data);
      toast("Musik-Ordner entfernt");
    } catch {
      toast("Import-Server nicht erreichbar");
    }
    setScanning(false);
  };

  const remove = async (file: string, name: string) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/collections?file=${encodeURIComponent(file)}`, { method: "DELETE" });
      if (r.ok) {
        toast(`„${name}" entfernt`);
        setTimeout(() => window.location.reload(), 600);
      } else {
        toast("Entfernen fehlgeschlagen");
        setBusy(false);
      }
    } catch {
      toast("Import-Server nicht erreichbar");
      setBusy(false);
    }
  };

  const removeAll = async () => {
    if (!cols?.length) return;
    if (!confirm("Alle Ordner aus der Bibliothek entfernen?")) return;
    setBusy(true);
    try {
      await Promise.all(
        cols.map((c) => fetch(`/api/collections?file=${encodeURIComponent(c.file)}`, { method: "DELETE" })),
      );
      toast("Bibliothek geleert");
      setTimeout(() => window.location.reload(), 600);
    } catch {
      toast("Fehler beim Leeren");
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="flex items-center justify-center p-4"
      style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.55)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-line bg-surface p-5"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-[15px] font-medium text-ink">Bibliothek — geladene Ordner</h2>
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="flex h-6 w-6 items-center justify-center rounded text-ink-faint hover:text-ink"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
        <p className="mb-3 text-[12px] text-ink-soft">
          Jede hochgeladene <span className="font-mono text-ink">.nml</span> ist ein Ordner und bleibt
          erhalten. Neue Uploads kommen dazu — hier kannst du einzelne wieder entfernen.
        </p>

        {cols === null ? (
          <div className="py-6 text-center text-[13px] text-ink-faint">lädt …</div>
        ) : cols.length === 0 ? (
          <div className="rounded-md border border-dashed border-line-strong px-4 py-8 text-center text-[13px] text-ink-soft">
            Noch keine Ordner geladen. Oben über <span className="font-mono text-ink">.nml</span> eine
            Traktor-Playlist hinzufügen.
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {cols.map((c) => (
              <li
                key={c.file}
                className="flex items-center gap-2 rounded-md border border-line px-3 py-2"
              >
                <Folder size={15} weight="regular" className="flex-none text-ink-faint" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{c.name}</span>
                <button
                  onClick={() => remove(c.file, c.name)}
                  disabled={busy}
                  aria-label={`„${c.name}" entfernen`}
                  className="flex h-7 w-7 flex-none items-center justify-center rounded text-ink-faint transition-colors hover:text-accent disabled:opacity-40"
                >
                  <Trash size={14} weight="regular" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {!!cols?.length && (
          <div className="mt-4 flex justify-end border-t border-line pt-3">
            <button
              onClick={removeAll}
              disabled={busy}
              className="text-[12px] text-ink-faint transition-colors hover:text-accent disabled:opacity-40"
            >
              alle entfernen
            </button>
          </div>
        )}

        <div className="mt-5 border-t border-line pt-4">
          <h3 className="text-[13px] font-medium text-ink">Musik-Ordner — Cover &amp; Vorhören</h3>
          <p className="mt-1 mb-2 text-[12px] text-ink-soft">
            Zeigt die .nml auf Pfade eines anderen Rechners (Mac ↔ Windows), findet Re:SET die
            Dateien hier über ihren Namen wieder. Ordner-Pfad einfügen, kurz scannen lassen — fertig.
          </p>
          <div className="flex gap-2">
            <input
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSource()}
              placeholder="z. B. H:\Musik\MeineTracks"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-md border border-line bg-base px-2 py-1.5 font-mono text-[12px] text-ink outline-none placeholder:text-ink-faint focus:border-line-strong"
            />
            <button
              onClick={addSource}
              disabled={scanning || !newPath.trim()}
              className="flex flex-none items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:text-ink disabled:opacity-40"
            >
              <MagnifyingGlass size={13} weight="bold" />
              {scanning ? "scanne …" : "Hinzufügen"}
            </button>
          </div>

          {sources && sources.sources.length > 0 && (
            <>
              <ul className="mt-2 flex flex-col gap-1">
                {sources.sources.map((p) => (
                  <li
                    key={p}
                    className="flex items-center gap-2 rounded-md border border-line px-3 py-2"
                  >
                    <Folder size={15} weight="regular" className="flex-none text-ink-faint" />
                    <span
                      className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink"
                      title={p}
                    >
                      {p}
                    </span>
                    <button
                      onClick={() => removeSource(p)}
                      disabled={scanning}
                      aria-label={`Musik-Ordner „${p}" entfernen`}
                      className="flex h-7 w-7 flex-none items-center justify-center rounded text-ink-faint transition-colors hover:text-accent disabled:opacity-40"
                    >
                      <Trash size={14} weight="regular" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-1.5 text-[11px] text-ink-faint">
                {sources.files} Audio-Dateien im Index
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
