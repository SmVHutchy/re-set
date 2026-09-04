# Re:SET — Roadmap & Fortschritt

Wo wir stehen. Vollständige Spezifikation: [PFLICHTENHEFT.md](PFLICHTENHEFT.md).
Detaillierte Historie: `git log --oneline`.

## Erledigt
- [x] **AP0 — Spike** · NML-Parser, Camelot-Mapping, Cover-Wall in den finalen Tokens `(c4e0034)`
- [x] **AP1/AP2 — Tagging + Set-Builder** · Energie/Phase/Vibe, Persistenz (localStorage), Live-Kompatibilitäts-Ampel `(8f51c27)`
- [x] **Energie-Timeline** · Set als Energiekurve, Phasen-Zonen, Übergangs-Ampel `(ed33ba0)`
- [x] **Agent-Doku** · AGENTS.md + CLAUDE.md `(7c065b7)`
- [x] **Echte Daten** · Import aus MP3-Ordner (Metadaten + echte Cover) → läuft auf deiner Musik
- [x] **Set-Canvas** · freie Cover-Fläche, Karten frei ziehen, Verbindungslinien in Set-Reihenfolge
- [x] **Feinschliff-Runde** · Typo selbst gehostet (Geist, tabular numerals) · Set-Verwaltung (wechseln/duplizieren/löschen + Dauer) · Suche + Sortierung · Batch-Tagging · Audio-Preview mit Wellenform

- [x] **Drag & Drop** im Set + **Tracklist-Export** (.m3u / Text kopieren)
- [x] **Editor- & Ordnungs-Runde** · Timeline-Auto-Order (Harmonize) + Energie an der Kurve ziehen · Canvas Cluster-Zonen (Drop taggt Phase) + harmonische Nachbarn · Library-Health (fehlende Keys/BPM/Cover, Duplikate) · Smart-Crates (Regel-Playlists)

- [x] **Politur-Runde** · Undo/Redo (⌘Z / ⌘⇧Z) · Stats-Verteilung (Phasen/Energie/Genres) in Health · Timeline-Kacheln per Tastatur auswählbar
- [x] **UX-Runde** · Feedback-Toasts · Tastatur-Shortcuts + ?-Hilfe-Overlay · persistenter Mini-Player (Vorhören beim Blättern) · Onboarding-Banner + Hover-/View-Politur
- [x] **Audioqualität** · Importer-Tiefenscan (ffmpeg: LUFS/True-Peak/HF-Cutoff) · Quality-Badges auf Covern · Inspector-Quality-Zeile · Health-„Qualität" (Low-Bitrate/Clipping/Transcode-Verdacht/Lautheits-Ausreißer)

- [x] **Server-Runde** · Express-Backend (`scripts/server.mjs`): Musik-Quellen mit Dateinamen-Index, Audio-Streaming mit Range-Support, Cover on demand aus ID3, mehrere Bibliotheks-Ordner statt einer Datei
- [x] **Traktor-Export** · NML-Playlist bzw. Playlist-Ordner je Phase (`nmlSinglePlaylist` / `nmlPlaylists`) · `.m3u` pro Phase · lokaler Auto-Modus (`autoset.ts`)

## Als Nächstes — Eine Oberfläche
Vollständiger Plan: [docs/UNIFIED-PIPELINE.md](docs/UNIFIED-PIPELINE.md) · Aufträge: [docs/HYPERPROMPT.md](docs/HYPERPROMPT.md)

Die Kette Link → Download → Analyse → Set → Traktor läuft heute über zwei
getrennte Programme. Sie wird in Re:SET zusammengeführt; SpotifyDL bleibt als
Download- und Analyse-Motor erhalten und wird vom Server als Kindprozess gestartet.

- [x] **AP-B Stufe 1 — Open Key** · Key-Tags in Open-Key-Notation (`1m`–`12d`) wurden von `toCamelot()` verworfen. Umrechnung aus 497 Referenzpaaren hergeleitet, 497/497 korrekt → 1155 Tracks zeigen ihren Key ohne Analyse.
- [ ] **AP-B Stufe 2 — BPM/Key rechnen** · `scripts/analyze.py` (librosa, über `uv run --script`, PEP-723-Abhängigkeiten) · `import-music.mjs --analyze` · Blindtest-Messung über `scripts/eval-analysis.mjs`. Trefferquoten in [docs/UNIFIED-PIPELINE.md](docs/UNIFIED-PIPELINE.md) §6.0.
- [ ] **AP-A — Download in der Oberfläche** — `/api/download`, Job-Queue, Tab „Laden"; der Playlist-Name wird Ordnername und damit Bibliotheks-Label
- [ ] **AP-C — Traktor-Roundtrip** — Cues/Beatgrid lesen, Write-Back mit Pflicht-Backup, Dry-Run und atomarem Schreiben
- [ ] **AP-D — Sync-Engine** — Adapter-Interface + Traktor-Adapter, Konflikte anzeigen statt auflösen (Lexicon-Parität)
- [ ] **AP-E — Eine Oberfläche** — Laden · Bibliothek · Planen · Sync · Health

## Später
- [ ] **Cover-Wall-Virtualisierung** — flüssig bis 5.000+ Tracks
- [ ] **Weitere Sync-Ziele** — Rekordbox (XML), Serato (GEOB-ID3), Engine DJ (SQLite)
- [ ] **Tauri-Shell** — Verpackung als Desktop-App; die Dateisystem-Rolle übernimmt vorerst der Express-Server

## Bekannte Platzhalter
- Energie/Phase sind manuell zu taggen (kein Auto-Vorschlag).
- BPM/Key kommen nur, wenn sie in den Datei-Tags stehen (sonst leer — bei DnB/Jungle oft da, sonst über Traktor-Analyse). **Behebt AP-B.**
- Der Traktor-Export schreibt NML-*Dateien* zum manuellen Import, nicht in eine bestehende `collection.nml`. **Behebt AP-C.**
