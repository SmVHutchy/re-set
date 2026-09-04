/**
 * Liest einen NDJSON-Stream (eine JSON-Zeile pro Ereignis) von einem
 * POST-Endpunkt und ruft für jedes Ereignis `onEvent`.
 *
 * Server-seitig laufen Import und Download nach demselben Muster: ein
 * Kindprozess, dessen Ausgabe zeilenweise durchgereicht wird, `{type:"log"}`
 * fürs Live-Log, `{type:"done"}` als letzte Zeile. Diese Schleife gehört
 * deshalb an eine Stelle und nicht in jede Komponente.
 */
export interface StreamEvent {
  type: string;
  msg?: string;
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface StreamResult {
  ok: boolean;
  /** Das abschließende done-Ereignis — trägt je nach Endpunkt Zusatzfelder. */
  done: StreamEvent | null;
  /** Fehler *vor* dem Stream (ungültige Eingabe o. Ä.), als JSON geliefert. */
  error?: string;
}

export async function streamNdjson(
  url: string,
  body: unknown,
  onEvent: (evt: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  // Fehler vor dem Stream (z. B. Ordner nicht gefunden) kommen als JSON.
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: "Anfrage fehlgeschlagen" }));
    return { ok: false, done: null, error: err.error || "Anfrage fehlgeschlagen" };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done: StreamEvent | null = null;

  for (;;) {
    const { value, done: finished } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let evt: StreamEvent;
      try {
        evt = JSON.parse(line);
      } catch {
        continue; // unvollständige/kaputte Zeile überspringen, nicht abbrechen
      }
      onEvent(evt);
      if (evt.type === "done") done = evt;
    }
  }

  return { ok: done?.success === true, done };
}
