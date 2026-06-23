# SetForge

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

Ersetze `public/collection.sample.nml` durch eine **Kopie** deiner echten
`collection.nml` (Traktor: Dokumente → Native Instruments → Traktor …) und lade neu.
Der Parser arbeitet read-only auf der Kopie — deine echte Library wird nie angefasst.
