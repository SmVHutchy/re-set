import React, { useRef, useState } from "react";
import { FileArrowUp } from "@phosphor-icons/react";
import { toast } from "../lib/toast";

// Lädt eine echte Traktor-collection.nml direkt im Browser hoch und macht sie
// zur aktiven lokalen Library (überschreibt public/collection.local.nml am Server).
export function UploadNmlButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // dieselbe Datei später erneut wählbar machen
    if (!file) return;

    setBusy(true);
    try {
      const xml = await file.text();
      if (!xml.includes("<NML")) {
        toast("Keine gültige .nml-Datei");
        setBusy(false);
        return;
      }
      const name = file.name.replace(/\.nml$/i, "");
      const res = await fetch(`/api/upload-nml?name=${encodeURIComponent(name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: xml,
      });
      if (res.ok) {
        toast(`Ordner „${name}" hinzugefügt`);
        setTimeout(() => window.location.reload(), 1000);
      } else {
        // Steht der Import-Server (npm run server) nicht, liefert der Vite-Proxy
        // 502/504 mit HTML statt JSON → das ist keine „ungültige Datei", sondern
        // eine fehlende Verbindung. Handlungsleitend melden.
        const err = await res.json().catch(() => null);
        toast(
          err?.error ??
            (res.status === 502 || res.status === 503 || res.status === 504
              ? "Import-Server nicht erreichbar — läuft „npm run server\"?"
              : `Upload fehlgeschlagen (${res.status})`),
        );
        setBusy(false);
      }
    } catch (err) {
      console.error(err);
      toast("Import-Server nicht erreichbar — läuft „npm run server\"?");
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex h-8 items-center gap-1.5 rounded-md border border-line bg-base px-2.5 text-[12px] font-medium text-ink-soft hover:text-ink transition-colors disabled:opacity-50"
        title="Echte Traktor collection.nml hochladen"
      >
        <FileArrowUp size={14} weight="regular" /> {busy ? "Lädt…" : ".nml"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".nml,application/xml,text/xml"
        onChange={onFile}
        className="hidden"
      />
    </>
  );
}
