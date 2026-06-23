# SetForge — Roadmap & Fortschritt

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

## Als Nächstes (Vorschläge)
- [ ] **Cover-Wall-Virtualisierung** — flüssig bis 5.000+ Tracks
- [ ] **Drag & Drop** im Set statt Hoch/Runter-Buttons
- [ ] **Tracklist-Export** (.m3u / Text kopieren)
- [ ] **AP3 — Write-Back nach Traktor** — braucht Rust/Tauri-Shell (Backup, Dry-Run)

## Bekannte Platzhalter
- Energie/Phase sind manuell zu taggen (kein Auto-Vorschlag).
- BPM/Key kommen nur, wenn sie in den Datei-Tags stehen (sonst leer — bei DnB/Jungle oft da, sonst über Traktor-Analyse).
