import React, { useState, useEffect, useRef } from "react";
import { Upload } from "@phosphor-icons/react";
import { toast } from "../lib/toast";

export function ImportButton() {
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [folders, setFolders] = useState<Array<{ name: string; path: string }>>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [deepScan, setDeepScan] = useState(false);
  const [customPath, setCustomPath] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showDialog) {
      loadFolders();
    }
  }, [showDialog]);

  // Log immer ans untere Ende scrollen, wenn neue Zeilen kommen.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logLines]);

  const loadFolders = async () => {
    try {
      const res = await fetch("/api/music-folders");
      if (res.ok) {
        const data = await res.json();
        setFolders(data);
        if (data.length > 0 && !selectedFolder) {
          setSelectedFolder(data[0].path);
        }
      }
    } catch (err) {
      console.error(err);
      toast("Fehler beim Laden der Ordner");
    }
  };

  const handleImport = async () => {
    const folderToImport = useCustom ? customPath : selectedFolder;
    if (!folderToImport) {
      toast("Bitte Ordner auswählen");
      return;
    }
    setLoading(true);
    setLogLines([]);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: folderToImport, deep: deepScan }),
      });

      // Fehler vor dem Stream (z.B. Ordner nicht gefunden) kommen als JSON.
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Import fehlgeschlagen" }));
        toast(err.error || "Import fehlgeschlagen");
        setLoading(false);
        return;
      }

      // NDJSON-Stream zeilenweise lesen und live ins Log schreiben.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let ok = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line);
          if (evt.type === "log") {
            setLogLines((prev) => [...prev, evt.msg]);
          } else if (evt.type === "done") {
            ok = evt.success;
            if (!ok) toast(evt.error || "Import fehlgeschlagen");
          }
        }
      }

      if (ok) {
        setLogLines((prev) => [...prev, "Fertig — lade neu …"]);
        toast("Import erfolgreich");
        // Nach dem Reload direkt nach Ordner gruppiert anzeigen.
        localStorage.setItem("reset.sort", "folder");
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      toast("Netzwerkfehler");
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className="flex h-8 items-center gap-1.5 rounded-md border border-line bg-base px-2.5 text-[12px] font-medium text-ink-soft hover:text-ink transition-colors"
        title="Musik aus Ordner importieren"
      >
        <Upload size={14} weight="regular" /> Import
      </button>

      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !loading && setShowDialog(false)}>
          <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-sm font-medium text-ink">Musik importieren</h2>
            <p className="mb-4 text-xs text-ink-soft">Wähle einen Ordner mit MP3, FLAC oder WAV-Dateien</p>

            <div className="mb-4 space-y-3">
              {folders.length > 0 && (
                <div>
                  <label className="block mb-1.5 text-xs font-medium text-ink-soft">Verfügbare Ordner:</label>
                  <select
                    value={selectedFolder || ""}
                    onChange={(e) => {
                      setSelectedFolder(e.target.value);
                      setUseCustom(false);
                    }}
                    disabled={useCustom}
                    className="w-full rounded-md border border-line bg-base px-3 py-2 text-sm text-ink outline-none focus:border-line-strong disabled:opacity-50"
                  >
                    {folders.map((f) => (
                      <option key={f.path} value={f.path}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="relative">
                <label className="flex items-center gap-2 text-xs font-medium text-ink-soft mb-1.5">
                  <input
                    type="checkbox"
                    checked={useCustom}
                    onChange={(e) => setUseCustom(e.target.checked)}
                    className="w-4 h-4 rounded border border-line cursor-pointer"
                  />
                  Eigenen Pfad eingeben
                </label>
                {useCustom && (
                  <input
                    type="text"
                    value={customPath}
                    onChange={(e) => setCustomPath(e.target.value)}
                    placeholder="z.B. /home/user/Music oder C:\\Users\\Music"
                    className="w-full rounded-md border border-line bg-base px-3 py-2 text-sm text-ink outline-none focus:border-line-strong placeholder:text-ink-faint"
                  />
                )}
              </div>
            </div>

            <label className="mb-5 flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={deepScan}
                onChange={(e) => setDeepScan(e.target.checked)}
                className="w-4 h-4 rounded border border-line cursor-pointer"
              />
              <span className="text-xs text-ink-soft">Tiefe Qualitäts-Analyse</span>
              <span className="text-[10px] text-ink-faint">(langsamer)</span>
            </label>

            {logLines.length > 0 && (
              <div className="mb-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-ink-soft">Analyse-Log</span>
                  <span className="font-mono text-[10px] text-ink-faint">{logLines.length} Zeilen</span>
                </div>
                <div
                  ref={logRef}
                  className="h-40 overflow-y-auto rounded-md border border-line bg-base p-2 font-mono text-[11px] leading-relaxed text-ink-soft"
                >
                  {logLines.map((line, i) => (
                    <div key={i} className="whitespace-pre-wrap break-words">
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowDialog(false)}
                disabled={loading}
                className="flex-1 rounded-md border border-line bg-base px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink disabled:opacity-50 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleImport}
                disabled={loading || (!useCustom && !selectedFolder) || (useCustom && !customPath)}
                className="flex-1 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-strong active:translate-y-[1px] disabled:opacity-50 transition-all"
              >
                {loading ? "Importiert…" : "Importieren"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
