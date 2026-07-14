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
      const res = await fetch("/api/upload-nml", {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: xml,
      });
      if (res.ok) {
        toast("Collection geladen");
        setTimeout(() => window.location.reload(), 1000);
      } else {
        const err = await res.json().catch(() => ({ error: "Upload fehlgeschlagen" }));
        toast(err.error || "Upload fehlgeschlagen");
        setBusy(false);
      }
    } catch (err) {
      console.error(err);
      toast("Netzwerkfehler");
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
