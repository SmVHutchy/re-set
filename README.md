# Re:SET

Visueller, Cover-zentrierter Set-Planer für DJ-Live-Sets auf Basis der Traktor-Pro-4-Library.
Konzept & Spezifikation: [PFLICHTENHEFT.md](PFLICHTENHEFT.md).

## Status: AP0 — Spike

Beweist die Machbarkeit der Kette **NML lesen → Tracks → Cover-Wall** im finalen
Design-System (Tech Utility, §15). Läuft als reine Web-SPA (Vite) — die spätere
Tauri-Shell + Rust-Core fürs Write-Back kommt ab AP1/AP3.

Was schon echt ist:
- `src/lib/nml.ts` — defensiver Parser für `collection.nml` (Titel, Artist, BPM, Key, Genre, Pfad)
- `src/lib/camelot.ts` — Traktor-Key → Camelot + harmonischer Score
- Cover-Wall mit Filter, Loading-/Empty-/Error-States, in den locked Tokens

Noch Platzhalter (klar markiert):
- Cover-Art (echte Extraktion aus den Audiodateien folgt; aktuell phasengetönte Tiles)
- Energie/Phase (Demo-Werte aus `src/lib/tags.ts`, bis echtes Tagging — FA-6)

## Starten

```bash
npm install
npm run dev
```

## Eigene Library testen

Zwei Wege — die App lädt `collection.local.nml` bevorzugt, sonst die Beispiel-Fixture:

**A) Ordner mit Musik importieren** (zieht Metadaten + echte Cover aus den Dateien):

```bash
npm run import:music -- "/Pfad/zu/deinem/Musik-Ordner"
```

Schreibt `public/collection.local.nml` + `public/covers/` (beide gitignored, read-only auf der Quelle).
BPM/Key kommen nur, wenn sie in den Datei-Tags stehen.

**B) Echte Traktor-Library:** Kopiere deine `collection.nml`
(Traktor: Dokumente → Native Instruments → Traktor …) nach `public/collection.local.nml`.
Hat alle analysierten BPM/Keys → harmonische Kompatibilität funktioniert voll.
