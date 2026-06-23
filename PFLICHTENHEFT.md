# Pflichtenheft — „SetForge"

**Visueller, Cover-zentrierter Set-Planer für DJ Live-Sets auf Basis der Traktor-Pro-4-Library**

Version 0.1 (Entwurf) · Stand: 2026-06-23

---

## 0. Entscheidungen (Leitplanken)

| Thema | Entscheidung |
|---|---|
| Traktor-Integration | **Volle Write-Back-Integration** — Sets werden als Playlists/Crates in `collection.nml` zurückgeschrieben (mit Pflicht-Backup). |
| Plattform | **macOS + Windows** (Cross-Platform). |
| Verhältnis zu Traktor | **Begleit-Tool, kein Ersatz.** Traktor bleibt Single Source of Truth fürs Abspielen. |
| Datenhaltung | Eigene lokale **SQLite**-DB als Arbeitsschicht; Audiodateien werden nie verändert. |

---

## 1. Überblick & Ziele

### 1.1 Problem
Die Library-Verwaltung in Traktor Pro 4 ist für die Set-Vorbereitung zu langsam und unintuitiv: starre Ordnerstruktur, zu kleine Cover-Anzeige, kein freies visuelles Planen nach Energie/Vibe/Kompatibilität.

### 1.2 Produktziel
Ein Tool, das **auf der bestehenden Traktor-Library aufsetzt** und die Vorbereitungs-Schicht davor bildet: Tracks mehrdimensional organisieren, Sets visuell und Cover-zentriert planen, harmonische/energetische Kompatibilität sehen — und das fertige Set als Traktor-Playlist zurückschreiben.

### 1.3 Leitprinzipien
1. **Non-destruktiv** — Audiodateien und Traktor-Track-Metadaten werden nie verändert; nur Playlists/Crates werden geschrieben, immer mit Backup.
2. **Cover-first** — Artwork ist das primäre Erkennungsmerkmal, groß und flüssig.
3. **Mehrdimensional statt Ordner** — Tags & Smart-Crates statt fester Ordner.
4. **Vorschlag, kein Autopilot** — das Tool schlägt vor, der DJ entscheidet.

### 1.4 Erfolgskriterien (messbar)
- Ein 2-Stunden-Set lässt sich in **unter 15 Minuten** vorbereiten (heute deutlich länger).
- Cover-Grid mit **10.000+ Tracks** scrollt flüssig (60 fps, kein spürbares Nachladen).
- Zurückgeschriebene Playlist öffnet **fehlerfrei** in Traktor Pro 4.
- **Null** Datenverlust an Traktor-Daten über alle Schreibvorgänge.

---

## 2. Scope

### 2.1 In Scope (v1)
- Import & Sync der Traktor-Library (`collection.nml`).
- Cover-Extraktion & -Cache.
- Mehrdimensionales Tagging (Energie, Phase, Vibe, eigene Felder).
- Fünf visuelle Ansichten (siehe §8).
- Kompatibilitäts-Engine (Camelot + BPM + Energie).
- Set-Bau & **Write-Back** als Traktor-Playlist + `.m3u`-Export.
- Backup-/Restore-Mechanik für `collection.nml`.

### 2.2 Out of Scope (v1, ggf. später)
- Echtes Abspielen/Mixen (bleibt in Traktor).
- Echtzeit-Stems-Trennung.
- Eigene Audio-Analyse (Key/BPM) — zunächst Traktor-Werte nutzen.
- Support für Serato/rekordbox/Engine DJ (Architektur offen halten, aber nicht bauen).
- Cloud-Sync/Mobile.

### 2.3 Annahmen
- Nutzer hat Traktor Pro 4 mit gültiger `collection.nml`.
- Tracks haben überwiegend Cover sowie BPM/Key (sonst graceful fallback).
- Nutzer arbeitet primär auf einem Rechner (kein Multi-Device-Merge in v1).

---

## 3. Personas & User Stories

**Persona „Live-DJ" (Primärnutzer = du):** plant Sets nach Verlauf (pre/mid/peak/late), denkt in Vibe & Energie, will Cover sehen.

Kern-User-Stories:
- US-1: Als DJ will ich meine Traktor-Library importieren, ohne in Traktor etwas kaputtzumachen.
- US-2: Als DJ will ich Tracks mit Energie (1–10), Phase und Vibe-Tags versehen, damit ich nicht in Ordnern suchen muss.
- US-3: Als DJ will ich eine große Cover-Wand mit Filtern, um schnell Tracks zu erkennen.
- US-4: Als DJ will ich Tracks auf einer Energie-Timeline anordnen und Energie-Löcher/Doppel-Peaks sofort sehen.
- US-5: Als DJ will ich zu einem Track sehen, welche anderen harmonisch & tempomäßig passen.
- US-6: Als DJ will ich das geplante Set als Playlist nach Traktor zurückschreiben.
- US-7: Als DJ will ich, dass meine Tags & Sets über Sessions erhalten bleiben und re-syncbar sind.

---

## 4. Funktionale Anforderungen

Priorität: **M** = Must (v1), **S** = Should (v1, nach Must), **C** = Could (später).

### 4.1 Import & Sync
- FA-1 (M): `collection.nml` parsen (NML-Version erkennen; getestet gegen v19 + ältere). Tracks, Metadaten, Playlists, Cue-Points einlesen.
- FA-2 (M): Tracks in lokale SQLite-DB spiegeln; stabile Track-ID über Datei-Pfad + Audio-Hash.
- FA-3 (M): Cover extrahieren (ID3/FLAC-Tags bzw. Traktor-Cache) und als Thumbnails (z. B. 256/512 px) cachen.
- FA-4 (S): Re-Sync — geänderte/neue/entfernte Tracks erkennen; eigene Tags bleiben erhalten (Merge über Track-ID).
- FA-5 (S): Konflikt-Anzeige, wenn Traktor-Daten sich seit letztem Sync geändert haben.

### 4.2 Organisation & Tagging
- FA-6 (M): Eigene Felder pro Track: `energy` (1–10), `phase` (pre/mid/peak/late, mehrfach erlaubt), `vibe`-Tags (frei), Notizen.
- FA-7 (M): Batch-Tagging (Mehrfachauswahl → Tag setzen/entfernen).
- FA-8 (M): Camelot-Normalisierung: Traktor-Key → Camelot (1A–12B) + Anzeige in Open-Key/klassisch wählbar.
- FA-9 (S): Smart-Crates — gespeicherte Filter (z. B. „Peak + 126–129 + driving").
- FA-10 (C): Tag-Vorschläge (Energie/Vibe automatisch aus Audio-Features) — als Vorschlag, editierbar.

### 4.3 Set-Planung
- FA-11 (M): Set anlegen mit benannter Reihenfolge (Drag&Drop-Liste).
- FA-12 (M): Kompatibilitäts-Score zwischen aufeinanderfolgenden Tracks anzeigen (grün/gelb/rot, siehe §7).
- FA-13 (S): Phasen-Templates (z. B. 2h: 20% pre / 30% mid / 35% peak / 15% late); Kandidaten je Phase vorschlagen.
- FA-14 (S): „Next-Track"-Vorschläge — Top-N kompatible Tracks zum aktuell letzten.
- FA-15 (S): Energie-Kurve des Sets visualisieren; Warnungen bei Brüchen/Doppel-Peaks.
- FA-16 (C): Set-Versionierung (mehrere Varianten eines Sets), Notizen pro Übergang.

### 4.4 Export / Write-Back
- FA-17 (M): **Pflicht-Backup** der `collection.nml` (versioniert, mit Zeitstempel) **vor jedem** Schreibvorgang.
- FA-18 (M): Set als neue Traktor-Playlist/Crate in `collection.nml` schreiben (nur Playlist-Knoten, keine Track-Daten ändern).
- FA-19 (M): „Dry-Run"-Vorschau: zeigt vor dem Schreiben exakt, welche Knoten hinzugefügt/geändert werden.
- FA-20 (M): Alternativ-Export als `.m3u`.
- FA-21 (S): Restore — Backup mit einem Klick zurückspielen.
- FA-22 (S): Sicherheits-Check: nicht schreiben, während Traktor läuft / Datei gesperrt ist; warnen.

### 4.5 Visualisierung
- FA-23 (M): Cover-Wall (virtualisiertes Grid, Filter-Sidebar, Overlay mit Key/BPM/Energie).
- FA-24 (S): Set-Canvas (freie Fläche, Cover-Karten, Cluster = Abschnitte, Kompatibilitätslinien, Phasenfarben).
- FA-25 (S): Energie-Timeline (Kachelhöhe = Energie, Phasen-Zonen, Übergangs-Indikatoren).
- FA-26 (C): Camelot-Wheel (interaktiv, kompatible Nachbarn hervorheben).
- FA-27 (C): Vibe-Map (2D-Streukarte, z. B. Tempo × Energie).

---

## 5. Datenmodell

### 5.1 SQLite-Schema (Kern, vereinfacht)

```
tracks
  id              TEXT PK        -- stabil: hash(path)+audio_fingerprint
  traktor_uid     TEXT           -- Verweis in NML
  path            TEXT
  title, artist, album, genre, label   TEXT
  bpm             REAL
  key_traktor     TEXT
  key_camelot     TEXT           -- abgeleitet
  rating          INTEGER
  duration_s      INTEGER
  cover_path      TEXT           -- Pfad im lokalen Cache
  date_added      TEXT
  last_synced     TEXT

track_user            -- unsere eigene Schicht (überlebt Re-Sync)
  track_id        TEXT FK
  energy          INTEGER        -- 1..10
  notes           TEXT

track_tags
  track_id        TEXT FK
  tag_type        TEXT           -- 'phase' | 'vibe' | 'situation' | ...
  tag_value       TEXT           -- 'peak', 'hypnotic', ...

sets
  id, name, target_duration_s, template_id, created_at, updated_at

set_items
  set_id          TEXT FK
  position        INTEGER
  track_id        TEXT FK

phase_templates
  id, name, segments_json        -- z.B. [{phase:'pre',pct:0.2}, ...]

smart_crates
  id, name, filter_json
```

### 5.2 NML-Mapping (Auszug)
- `<ENTRY>` → `tracks` (Attribute TITLE/ARTIST; `<INFO>` GENRE/LABEL/RATING; `<TEMPO BPM>`; `<MUSICAL_KEY>`/`<INFO KEY>`; `<LOCATION>` → path).
- `<PLAYLIST>`/`<NODE>` → Traktor-Playlists (lesen + beim Write-Back neue Knoten anhängen).
- Cover: `<INFO COVERARTID>` bzw. eingebettete Tags.

> Hinweis: NML ist von NI **nicht offiziell dokumentiert**. Parser wird gegen reverse-engineerte Schemas (z. B. `traktor-nml-utils`) und mehrere echte Dateien getestet und versioniert gekapselt.

---

## 6. Traktor-Integration & Sicherheit (Write-Back)

Da volles Write-Back gewählt wurde, ist Datensicherheit die wichtigste nicht-funktionale Anforderung.

- **Backup-First:** Vor jedem Schreibvorgang automatische, versionierte Kopie der `collection.nml` (`collection.nml.setforge-backup-<ISO-Zeit>`). Konfigurierbare Aufbewahrung (z. B. letzte 20).
- **Minimal-invasiv:** Es werden ausschließlich Playlist-/Crate-Knoten hinzugefügt; bestehende `<ENTRY>`-Track-Daten werden nie verändert.
- **Dry-Run:** Diff-Vorschau (was wird eingefügt) vor Bestätigung.
- **Atomar:** Schreiben in temporäre Datei → Validierung (XML wohlgeformt, Playlist auflösbar) → atomarer Replace.
- **Lock-Erkennung:** Wenn Traktor läuft / Datei gesperrt → Schreiben blockieren mit klarer Meldung.
- **Round-Trip-Test:** Nach Write-Back optional erneutes Parsen zur Verifikation.

---

## 7. Kompatibilitäts- & Set-Logik

### 7.1 Kompatibilitäts-Score (zwischen Track A → B)
Gewichtete Summe aus drei Faktoren, Ergebnis als Ampel (grün/gelb/rot):

**Harmonik (Camelot):**
- gleicher Code (z. B. 8A→8A) = perfekt
- ±1 Zahl, gleicher Buchstabe (8A→7A/9A) = sehr gut
- Buchstabenwechsel gleiche Zahl (8A→8B) = gut (Energy-Boost)
- sonst = abfallend bis Bruch

**Tempo (BPM):**
- innerhalb ±~6 % = grün
- Half/Double-Time erkannt (z. B. 128 ↔ 64/256, normalisiert) = grün (Sonderfall)
- 6–12 % = gelb; darüber = rot

**Energie-Delta:**
- |ΔE| ≤ 1 = smooth; ΔE = 2–3 = bewusster Anstieg (ok); großer Sprung = markiert (nicht automatisch schlecht).

Score = `wK·harm + wT·tempo + wE·energy` (Default-Gewichte z. B. 0,5 / 0,3 / 0,2; in Settings justierbar).

### 7.2 Phasen-Templates
Nutzer wählt Set-Länge + Verteilung → Tool teilt Zeit in Segmente und schlägt je Segment passende getaggte Tracks vor; bewertet die resultierende Energie-Kurve.

### 7.3 Next-Track
Ausgehend vom letzten Track: Top-N nach Kompatibilitäts-Score, gefiltert nach Ziel-Phase und „noch nicht im Set".

---

## 8. UI/UX-Spezifikation

Fünf Ansichten, gleicher Datenbestand, umschaltbar über eine Top-Leiste. Gemeinsame Elemente: Filter-Sidebar (Phase, Vibe, Tempo-Band, Key, Rating), Suchfeld, aktuelles Set als andockbares Panel.

1. **Cover-Wall (M):** virtualisiertes Raster großer Cover; Hover/Klick → Overlay mit Key·BPM·Energie; Multi-Select für Batch-Tagging; Drag in das Set-Panel.
2. **Set-Canvas (S):** unendliche Fläche; Tracks als große Cover-Karten frei platzierbar; zu Clustern (= Set-Abschnitten) gruppierbar; Karten nach Phase eingefärbt; Verbindungslinien zeigen Kompatibilität (grün/gelb/rot).
3. **Energie-Timeline (S):** X = Set-Verlauf, Kachelhöhe = Energie, farbige Phasen-Zonen; Übergangs-Indikatoren zwischen Kacheln; visuelle Warnung bei Energie-Loch/Doppel-Peak. (Mockup existiert bereits.)
4. **Camelot-Wheel (C):** Kreis-Diagramm; gewählter Track → kompatible Nachbarn leuchten; Cover an den Speichen.
5. **Vibe-Map (C):** 2D-Streukarte (z. B. Tempo × Energie); Cover als Punkte; räumliche Nähe = Verwandtschaft.

UX-Prinzipien: Tastatur-Shortcuts fürs Tagging, Drag&Drop überall, sofortiges visuelles Feedback, keine destruktiven Aktionen ohne Bestätigung.

---

## 9. Nicht-funktionale Anforderungen

- **Performance:** flüssig bis 10.000+ Tracks (virtualisierte Listen/Grids, gecachte Thumbnails, indexierte SQLite-Abfragen).
- **Datensicherheit:** siehe §6 — Backup-First, atomar, Dry-Run, Restore.
- **Cross-Platform:** identische Funktion auf macOS + Windows; plattformabhängige Pfade (Traktor-Verzeichnis, Cover-Cache) abstrahieren.
- **Robustheit:** Graceful Degradation bei fehlenden Covern/Keys/BPM.
- **Privatsphäre:** alles lokal; keine Cloud-Pflicht; keine ungefragte Telemetrie.
- **Wartbarkeit:** NML-Parsing in eigener, gekapselter Schicht (versionsfähig).

---

## 10. Tech-Architektur

| Schicht | Wahl |
|---|---|
| App-Shell | **Tauri** (Rust-Core + Web-Frontend), Cross-Platform Mac/Windows |
| Frontend | **React + TypeScript** |
| State/Daten | **SQLite** (Tauri-SQL-Plugin) + TanStack Query |
| Cover-Grid | **TanStack Virtual** (Virtualisierung) |
| Set-Canvas | **React Flow** (Karten + Verbindungslinien) |
| NML-Parsing | Rust (`quick-xml`) im Core, Logik referenziert an `traktor-nml-utils` |
| Audio/Waveform (später) | Web Audio API / `wavesurfer.js` |

Architektur-Schnitt: **Rust-Core** = Dateisystem, NML-Parsing/-Schreiben, Backup, DB-Zugriff (sicher, schnell). **React-Frontend** = ausschließlich Darstellung & Interaktion. Klare IPC-Grenze; alle riskanten Operationen (Write-Back) laufen im Core mit Validierung.

---

## 11. Roadmap & Arbeitspakete

- **AP0 — Spike (Machbarkeit):** echte `collection.nml` parsen, Cover ziehen, 50 Tracks im Grid rendern.
- **AP1 — Datenfundament (M):** SQLite-Schema, NML-Import, Cover-Cache, Backup-Logik, Track-ID-Strategie.
- **AP2 — Cover-Wall + Tagging (M):** virtualisiertes Grid, Filter, eigene Felder, Batch-Tagging, Camelot-Mapping.
- **AP3 — Set-Bau + Write-Back (M):** Set-Liste, Kompatibilitäts-Score, Dry-Run, Write-Back in NML, `.m3u`-Export, Round-Trip-Test in Traktor.
- **AP4 — Set-Canvas (S):** Fläche, Cluster, Kompatibilitätslinien, Phasenfarben.
- **AP5 — Timeline & Vorschläge (S):** Energie-Kurve, Phasen-Templates, Next-Track, Re-Sync.
- **AP6 — Polish (C):** Camelot-Wheel, Vibe-Map, Vorhören/Waveform, Performance-Härtung 10k+.

Meilensteine: **M1 = AP1–AP3 (nutzbares MVP mit Write-Back)** → **M2 = AP4–AP5 (visuelles Planen)** → **M3 = AP6 (Premium-Ansichten & Polish)**.

---

## 12. Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| NML-Format ändert sich / undokumentiert | gekapselter, versionierter Parser; Tests gegen mehrere echte Dateien; Backup-First |
| Datenverlust in Traktor | nur Playlist-Knoten schreiben; atomar; Dry-Run; Restore; Lock-Erkennung |
| Performance bei großer Library | Virtualisierung + Thumbnail-Cache + SQLite-Indizes von Anfang an |
| Scope-Explosion | strikt M-first; Canvas/Wheel/Map erst nach MVP |
| Cross-Platform-Pfade | Pfad-Abstraktion + Tests auf beiden OS |
| Unzuverlässige Keys/BPM in Quelle | graceful fallback; spätere optionale Eigen-Analyse |

---

## 13. Offene Punkte (für nächste Iteration zu klären)

- Library-Größe (für konkrete Performance-Ziele).
- Speicherort der `collection.nml` auf deinem System (Pfad bestätigen) + ob mehrere Collections existieren.
- Camelot vs. Open-Key Anzeige-Default.
- Tagging manuell vs. mit automatischen Vorschlägen (FA-10) — ja/nein für v1.
- Branding/Name final („SetForge" ist Arbeitstitel).

---

## 14. Abnahmekriterien (MVP / M1)

1. Import einer echten `collection.nml` ohne Fehler; Tracks + Cover sichtbar.
2. Tracks mit Energie/Phase/Vibe taggbar (inkl. Batch); Tags überleben Re-Sync.
3. Cover-Wall scrollt flüssig bei voller Library.
4. Set baubar; Kompatibilitäts-Ampel korrekt für Beispiel-Paare.
5. Write-Back erzeugt Playlist, die **fehlerfrei in Traktor Pro 4 öffnet**; Backup wurde vorher erstellt; Restore funktioniert.
6. Kein einziger Fall von veränderten/verlorenen Traktor-Track-Daten.

---

## 15. Design-System (Direction: Tech Utility)

Gewählte Richtung: **Tech Utility** — dunkles, hochkontrastiges Pro-Tool-UI im Stil von Linear/Vercel. Prinzip: das UI ist neutral und ruhig, **die Cover liefern die Farbe**. Alle visuellen Entscheidungen leiten sich aus diesen Tokens ab — keine arbiträren Rohwerte.

### 15.1 Farb-Tokens (dunkles Theme — locked, OKLch = Quelle, Hex = Referenz)

Leitsatz: **warmes Graphit statt kaltes Blauschwarz** (Analog-/Club-Wärme, kein Linear-Default). Genau **ein** Brand-Akzent. Brand-, Semantik- und Kategorie-Farben liegen in getrennten Hue-Bahnen und dürfen sich nie überlappen.

**Neutrale (warmes Graphit, Hue ~70):**

| Token | OKLch | ~Hex | Verwendung |
|---|---|---|---|
| `--bg-base` | oklch(0.16 0.006 70) | #14130F | tiefster App-Hintergrund |
| `--surface` | oklch(0.20 0.007 70) | #1C1A15 | Panels, Sidebar |
| `--surface-elevated` | oklch(0.245 0.008 70) | #24211A | Karten, Popover |
| `--border-subtle` | oklch(0.30 0.008 70) | #2E2A22 | Standard-Trennlinien (0.5px) |
| `--border-strong` | oklch(0.38 0.009 70) | #3C372D | Hover/Fokus-Rahmen |
| `--text-primary` | oklch(0.95 0.004 70) | #F1EFEA | Haupttext |
| `--text-secondary` | oklch(0.72 0.006 70) | #ACA69C | Sekundärtext |
| `--text-tertiary` | oklch(0.55 0.007 70) | #7C766C | Hints, Metadaten |

**Brand-Akzent (Cue-Magenta, Hue ~350 — kollisionsfrei zu allen Semantik-/Phasen-Hues):**

| Token | OKLch | ~Hex | Verwendung |
|---|---|---|---|
| `--accent` | oklch(0.66 0.20 350) | #EC5E8E | Primäraktion, Fokus-Ring, Auswahl |
| `--accent-strong` | oklch(0.59 0.20 350) | #D54A78 | Hover/Active |
| `--accent-soft` | oklch(0.31 0.07 350) | #3B1F2B | Akzent-Hintergrundfläche |
| `--accent-text` | oklch(0.84 0.10 350) | #F2A7C0 | Text auf `--accent-soft` |

**Funktionale Farben — Kompatibilität als „Signal", nicht Ampel (Cool-Band ~195):** Statt Verkehrsampel ein monochromer Cool-Signal-Scale (Match-Qualität = Helligkeit/Sättigung) + Magenta als einziger Warm-Interrupt. `--ok` oklch(0.80 0.11 195) (helles Cyan, „fließt") · `--okay` oklch(0.60 0.055 195) (gedimmt, „schwaches Signal") · `--break` = `--accent` oklch(0.66 0.20 350) (Magenta, „Clash — hinschauen"). Cyan ist **ausschließlich** der Kompatibilität vorbehalten. (Bewusste Doppelnutzung: `--break` ist der Brand-Akzent in seiner Rolle als Aufmerksamkeitsfarbe.)

**Kategorial — Energie-Phasen als Thermal-Ramp (Chroma = Intensität):** Kein Hue-Regenbogen, sondern eine sequentielle Hitze-Kurve kalt → heiß → Glut; Sättigung steigt zum Peak, fällt zur Glut — die Energiekurve liegt in der Farbe. `--phase-pre` oklch(0.60 0.06 245) (kühles Stahlblau, gedimmt) · `--phase-mid` oklch(0.62 0.11 290) (Indigo-Violett, Build) · `--phase-peak` oklch(0.66 0.18 20) (glühendes Rot-Coral, Maximum) · `--phase-late` oklch(0.64 0.07 50) (Bronze-Glut, Cooldown). Jeweils `-zone`-Tint (L≈0.25) für Timeline-/Canvas-Zonen.

> **Token-Disziplin (Hallmark Gate 58):** Im Code referenziert jede Farbe einen benannten Token; keine Inline-OKLch/Hex/`rgb()`. Wird ein neuer Wert gebraucht, wird er zuerst als benannter Token angelegt. Der Akzent ist bewusst **ein einziger Token** — ein anderer Brand-Ton (z. B. Cyan ~205 oder Amber-Gold) ist ein Ein-Zeilen-Swap von `--accent`, solange er kollisionsfrei zu Ampel & Phasen bleibt.

### 15.2 Typografie
- UI-Schrift: **Geist Sans** (locked). Inter ist bewusst **verworfen** (zu generisch fürs Premium-Tool; Dashboard-Regel: hochwertige Sans, keine Serifen in Software-UI).
- **Mono für Zahlen** (BPM, Key, Energie): **Geist Mono** — tabellarische Ziffern für saubere Ausrichtung. Im dichten Cockpit-Modus (Track-Listen) Mono für *alle* Zahlen.
- Skala: 11/12/13 (Meta) · 14/16 (Body) · 18/22 (Headings), `tracking-tight` auf Headern. Gewichte nur **400 / 500**, 600 sparsam für Zahlen-Akzente. **Keine überdimensionierten H1** — Hierarchie über Gewicht/Farbe, nicht über Riesen-Scale.

### 15.3 Spacing, Radius, Elevation, Motion
- **Spacing** (4er-Basis): 4 · 8 · 12 · 16 · 24 · 32 · 48.
- **Radius**: sm 6 · md 8 · lg 12 (Karten = lg). Keine Radien auf einseitigen Borders.
- **Elevation**: im Dark-Theme über Flächen-Stufen + Borders, **nicht** über Schatten. Schatten nur als Fokus-Ring.
- **Motion**: 120 ms (Micro), 200 ms (Standard), 320 ms (Canvas-Pan); Easing ease-out; nur `transform`/`opacity`; `prefers-reduced-motion` respektiert.

### 15.4 Signature-Moment (Innovation)
Die **Kompatibilitätslinien** auf der Set-Canvas und die **Energie-Kurve** der Timeline sind der wiedererkennbare Moment: lebendiges, farbcodiertes Feedback, das in Traktor komplett fehlt.

### 15.5 Selbstkritik-Gate (5 Dimensionen)
Kein UI-Artefakt gilt als fertig, bevor es gegen **Philosophy · Hierarchy · Detail · Function · Innovation** bewertet wurde; unter Schwellwert → konkrete Tweaks (Farb-Shift, Spacing-Delta, Font-Weight, Motion-Dauer), keine vagen Kommentare.

---

## 16. Frontend-Konventionen & Motion-Kalibrierung

### 16.1 Stack-Konkretisierung
- **UI:** React + TypeScript als **Vite-SPA im Tauri-Webview** (kein Next.js/RSC — eine Desktop-App hat keinen Server-Render-Layer; RSC-Regeln entfallen bewusst).
- **Styling:** Tailwind CSS v4 für ~90 % des Stylings; die §15-Tokens als Tailwind-Theme-Variablen. Keine Inline-Hex/OKLch, die das Token-System umgehen.
- **Icons:** ausschließlich `@phosphor-icons/react`, `strokeWidth` global **1.5**. Keine Emojis, keine generischen „egg"-Avatare.
- **Motion:** Framer Motion, isoliert in Leaf-Client-Komponenten; perpetuelle Loops `React.memo`-memoized; nur `transform`/`opacity` animieren (Hardware-Beschleunigung).
- **Layout-Robustheit:** CSS Grid statt Flex-Prozentmathe; `minmax(0,1fr)` für Cover-Tracks; `min-h-[100dvh]` statt `h-screen`; kein horizontaler Scroll bei schmaler Fensterbreite.

### 16.2 Design-Dials (für ein Arbeitstool kalibriert, nicht für eine Landingpage)
Skill-Baseline wäre 8/6/4 — für ein Live-Set-Prep-Tool bewusst angepasst:
- **VISUAL_DENSITY: 6** — Track-Listen tendieren Cockpit (1px-Trennlinien statt Card-Boxen, Mono-Zahlen); Cover-Wall darf atmen. Cards nur, wo Elevation echte Hierarchie trägt.
- **MOTION_INTENSITY: 3–4** — funktional, **keine** perpetuelle Dauer-Animation. Bewegung nur für Feedback (Auswahl, Drag, Übergänge); getönte statt Neon-Schatten. Im dunklen Booth darf nichts flackern oder ablenken.
- **DESIGN_VARIANCE: 5** — funktionale App-Layouts mit gezielter Asymmetrie auf der Canvas; bei schmaler Breite strikt einspaltig.

### 16.3 Bewusst NICHT übernommen
Das „Creative Arsenal" (Bento-Perpetual-Motion, Scrolltelling, Magnetic Buttons, Liquid-Glass-Hero, Kinetic Typo) ist Marketing-/Landingpage-Vokabular und für die **App** ungeeignet (lenkt bei der Set-Vorbereitung ab). → Reserviert für eine spätere **Promo-/Landingpage** von SetForge, nicht fürs Tool.

### 16.4 Reconciliation der Farb-/Typo-Regeln
- **Lila-Ban:** erfüllt — Violett entfernt; Akzent Deep-Rose/Magenta (erlaubt).
- **1 Akzent:** erfüllt — Cyan (Kompatibilität) & Thermal-Phasen sind funktionale/kategoriale Datenfarben, kein zweiter Brand-Ton.
- **Kein Pure-Black / Inter:** erfüllt — Off-Black `--bg-base`, Schrift Geist.
- **Akzent-Sättigung:** liegt am oberen, aber erlaubten Rand; vom Nutzer freigegeben → bleibt. Optionaler Dial: Chroma 0.20 → 0.17, falls es im Betrieb zu laut wirkt.
