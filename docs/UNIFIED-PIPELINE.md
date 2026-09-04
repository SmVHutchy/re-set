# Re:SET × SpotifyDL — Eine Oberfläche

**Architektur & Fahrplan für die durchgehende Kette: Link → Download → Analyse → Set → Traktor → Sync**

Stand: 2026-09-04 · Branch `feat/unified-pipeline` · Ergänzt [PFLICHTENHEFT.md](../PFLICHTENHEFT.md)

---

## 1. Ausgangslage

Zwei Projekte decken heute je eine Hälfte des Workflows ab und wissen nichts voneinander.

| | **SpotifyDL** (`H:\Projekte\SpotifyDL`) | **Re:SET** (dieses Repo) |
|---|---|---|
| Stack | Python 3.12 via `uv`, `dashboard.py` (Einzeldatei-HTTP-Server) | React 19 + Vite + Tailwind v4, Express (`scripts/server.mjs`) |
| Kann | spotdl (Spotify) · **yt-dlp (SoundCloud)** · streamrip (Tidal/Qobuz/Deezer) · Format- und Bitratenwahl · `organizer.py` sortiert nach Tags · `overnight.py` für Batch-Läufe | NML lesen · Cover-Wall · Tagging · Energie-Timeline · Set-Canvas · Smart-Crates · Health · Auto-Set · **NML-Export** · Audio-/Cover-Streaming |
| Kann nicht | BPM/Key, Traktor, Planung | Herunterladen, BPM/Key berechnen, in `collection.nml` zurückschreiben |

Die einzige Verbindung ist heute ein Pfad-String in `.music-sources.json`:

```json
["H:\\Projekte\\SpotifyDL\\Downloads\\SoundCloud\\smvhutchy_likes"]
```

Der Nutzer lädt in Tool A, wechselt zu Tool B, importiert von Hand. Jeder Schritt funktioniert, die Kette nicht.

### Die eigentliche Lücke: BPM und Key

`scripts/import-music.mjs` liest BPM und Key ausschließlich aus vorhandenen Datei-Tags:

```js
const bpm = c.bpm ? Math.round(Number(c.bpm)) : null;
const key = c.key || "";
```

Die Downloader schreiben beides praktisch nie. Damit laufen `compat.ts` (harmonische Kompatibilität), `autoset.ts` (Auto-Reihenfolge) und die halbe Timeline auf leeren Feldern — die Kernfunktionen der App sind auf genau dem Material blind, das der Downloader liefert. **Das ist der wichtigste Baustein, nicht die UI-Zusammenlegung.**

---

## 2. Zielbild

Ein Fenster, fünf Schritte, kein Werkzeugwechsel:

```
Link einwerfen
   │  spotdl / yt-dlp / streamrip, Playlist-Name = Ordnername
   ▼
Downloads/<Playlist>/…            ── Ordner wird automatisch Musik-Quelle
   │  librosa + essentia: BPM, Key, Camelot
   ▼
collection.local.nml              ── TEMPO/KEY gefüllt, Herkunft markiert
   │  Cover-Wall · Tagging · Timeline · Auto-Set
   ▼
Set                               ── Phasen, Energie, Kompatibilität
   │  NML-Playlist / .m3u / Write-Back
   ▼
Traktor                           ── spielbar
   │  Cues, Beatgrid, Rating zurück
   ▼
Re-Sync                           ── Traktor-Werte gewinnen
```

---

## 3. Architektur

**Ein Backend, eine Oberfläche, Python nur noch als Motor.**

```
┌──────────────────────────────────────────────────────┐
│  Browser — Re:SET SPA (React)                        │
│  Laden · Bibliothek · Planen · Sync · Health         │
└───────────────────────┬──────────────────────────────┘
                        │ HTTP + NDJSON-Streams
┌───────────────────────▼──────────────────────────────┐
│  scripts/server.mjs  (Express, Port 3001)            │
│  /api/download  /api/import  /api/analyze            │
│  /api/sources   /api/collections  /api/traktor/*     │
│  /api/audio     /api/cover                           │
└───────┬───────────────────────┬──────────────────────┘
        │ spawn                 │ spawn
┌───────▼──────────┐   ┌────────▼─────────────────────┐
│ import-music.mjs │   │ SpotifyDL — uv-Umgebung      │
│ (Node)           │   │ spotdl · yt-dlp · rip        │
└──────────────────┘   └──────────────────────────────┘
```

### Warum so

- **`server.mjs` bleibt das Backend.** Es kann bereits alles Nötige: Kindprozesse mit zeilenweisem NDJSON-Log (`:63`–`:105`), Dateisystem-Zugriff, Range-Streaming, Cover-Cache. Ein zweiter Server (Python) daneben würde zwei Ports, zwei Lebenszyklen und CORS bedeuten — für null Gewinn.
- **SpotifyDL wird nicht portiert.** spotdl, yt-dlp und streamrip sind Python, funktionieren, und werden gepflegt. Sie als Kindprozess zu starten ist exakt das Muster, das `server.mjs:76` schon für den Import nutzt.
- **Die Analyse ist Python.** librosa und essentia haben in JavaScript kein Äquivalent, das für Key-Erkennung ernsthaft in Frage käme. Die uv-Umgebung ist bereits da.
- **Kein Tauri in diesem Vorhaben.** Der Express-Server übernimmt vorerst die Dateisystem-Rolle, die das Pflichtenheft der Rust-Shell zugedacht hatte. Tauri bleibt als spätere Verpackung sinnvoll, blockiert aber nichts.

### Injektionsfreiheit

Jeder Prozessstart geht über ein Argument-Array ohne Shell — die Form aus `server.mjs:76`:

```js
const child = spawn(process.execPath, args, { cwd: ROOT });
```

URLs, Ordnernamen und Dateipfade kommen aus Nutzereingaben. Sobald irgendwo `shell: true` oder String-Konkatenation auftaucht, ist eine Playlist mit Semikolon und Befehl im Namen ein Problem. Diese Regel gilt für `/api/download` genauso.

---

## 4. API-Vertrag

### Vorhanden

| Route | Zweck |
|---|---|
| `GET /api/music-folders` | Quellen und ihre direkten Unterordner zur Auswahl |
| `POST /api/import` | Ordner importieren, NDJSON-Live-Log |
| `POST /api/upload-nml` | Traktor-`.nml` als neuen Bibliotheks-Ordner ablegen |
| `GET`/`DELETE /api/collections` | Bibliotheks-Ordner auflisten/entfernen |
| `GET`/`POST`/`DELETE /api/sources` | Musik-Quellen verwalten, Dateinamen-Index neu bauen |
| `GET /api/audio` | Audio streamen (Range-Support fürs Seeken) |
| `GET /api/cover` | Cover aus ID3 extrahieren (ETag, mtime-Cache) |

### Neu

| Route | Body / Query | Antwort |
|---|---|---|
| `POST /api/download` | `{ url, source, format, bitrate }` | NDJSON: `queued` / `start` / `log` / `done` *(gebaut)* |
| `GET /api/jobs` | — | Laufender Auftrag und Warteschlange *(gebaut)* |
| `DELETE /api/jobs/:id` | — | Auftrag abbrechen *(gebaut)* |
| `POST /api/import` | zusätzlich `analyze: true` | wie bisher; fehlende BPM/Key werden gerechnet und als Schätzung markiert *(gebaut)* |
| `POST /api/analyze` | `{ files[] }` oder `{ folder }` | NDJSON je Datei — eigenständiger Endpunkt für Nachanalyse ohne Neuimport *(offen)* |
| `POST /api/traktor/dry-run` | `{ collectionPath, setId }` | Diff-Vorschau, schreibt nichts *(offen)* |
| `POST /api/traktor/write` | `{ collectionPath, setId, confirm }` | `{backup, written, entries}` *(offen)* |
| `GET /api/traktor/status` | — | Läuft Traktor? Datei gesperrt? *(offen)* |

**NDJSON-Konvention:** eine JSON-Zeile pro Ereignis, `{type:"log", msg}` fürs Log-Fenster, `{type:"done", success, …}` als letzte Zeile. Die Client-Seite liegt in `src/lib/ndjson.ts` (`streamNdjson`) und wird von Import und Download geteilt.

---

## 5. Playlist wird Ordnername

Der Ordnername ist die Klammer zwischen beiden Hälften. `import-music.mjs:104` schreibt ihn als eigenes `FOLDER`-Attribut in die NML:

```js
const folder = relDir ? `${rootName}/${relDir}` : rootName;
```

Heißt der Download-Ordner wie die Playlist, ist das Gruppen-Label in der Bibliothek automatisch der Playlist-Name — ohne eine Zeile Zusatzlogik.

Die Kommandos stehen in `scripts/download.mjs`; Engines und Formatmatrix stammen aus `dashboard.py` (`build_command`) und wurden übernommen, nicht neu erfunden.

- **spotdl** (Spotify): `Spotify/{list-name}/{artists} - {title}.{output-ext}` für Playlists und Alben, flach für Einzeltracks.
- **yt-dlp** (SoundCloud): `%(playlist_title|Einzelne Tracks)s/%(uploader)s - %(title)s.%(ext)s`. Der Ersatzname greift, wenn die Quelle keinen Listennamen liefert — so landet nichts flach im Wurzelordner. Im Trockenlauf gegen eine echte Likes-Seite geprüft.
- **streamrip** (Tidal/Qobuz/Deezer): Ordner-Templates aus der `streamrip.toml`, Pfad über `STREAMRIP_CONFIG`.

AIFF können weder spotdl noch yt-dlp direkt; das Kommando fällt auf WAV zurück und meldet, dass die Umwandlung per ffmpeg noch aussteht.

Die Werkzeuge werden im venv gesucht, das SpotifyDL beim ersten Start anlegt (`SPOTIFYDL_VENV`, sonst `~/.spotifydl/venv`), sonst auf dem `PATH`. Das Zielverzeichnis kommt aus `DOWNLOAD_PATH` — kein fester Pfad im Code.

---

## 6. Analyse: BPM und Key

### 6.0 Gemessen, nicht geschätzt (2026-09-04)

Grundlage: die echte `collection.nml` (Traktor Pro 4, `NML VERSION="20"`, 4701 Einträge) gegen `H:\Projekte\SpotifyDL\Downloads` (4738 Audiodateien).

| Messung | Ergebnis |
|---|---|
| Collection-Einträge, deren Datei in `SpotifyDL/Downloads` liegt | **4675 von 4701** — die Traktor-Library *ist* praktisch die Download-Sammlung |
| Dateien ohne BPM- **und** ohne Key-Tag (Vollzählung über alle 4738) | **3583 = 75,6 %** |
| Dateien mit BPM- und Key-Tag | 1155 = 24,4 % — davon **1155 in Open-Key-Notation**, also ausnahmslos |
| Tracks mit Traktor-Analyse (`TEMPO` + `MUSICAL_KEY`) | 497 mit auffindbarer Datei |
| Traktor-BPM gegen Datei-Tag | 411 identisch (< 0,01), 86 innerhalb 1,0, **0 Abweichungen ≥ 1,0** → Traktor hat seine Werte in die Dateien zurückgeschrieben |
| Einträge mit Cues | 562 |

Zwei Konsequenzen, die den Auftrag ändern:

**a) Die 497 analysierten Tracks sind die Grundwahrheit — aber nicht direkt testbar.** Sie tragen Traktors Werte inzwischen selbst als Tag; ein Analysator würde die Antwort ablesen statt sie zu berechnen. Der Test läuft deshalb blind auf **tagfreien Kopien** (`ffmpeg -map_metadata -1 -c copy`), die Erwartung liegt daneben in einer `expected.json`. Ein solcher Satz existiert: 29 Tracks über 12 BPM-Bänder von 71 bis 190 BPM, verifiziert taglos und lesbar.

**b) Die Key-Tags sind in Open-Key-Notation — und wurden verworfen.** Alle 497 Datei-Keys stehen als `1m`–`12m` / `1d`–`12d` (`11m`: 55×, `10m`: 55×, `1m`: 51× …). `toCamelot()` in `src/lib/camelot.ts` prüfte gegen `CAMELOT_RE` (`^(1[0-2]|[1-9])[ABab]$`) und `NAME_TO_CAMELOT` (klassische Namen); Open Key trifft weder das eine noch das andere, und `MUSICAL_KEY` gibt es bei importierten Ordnern nicht. Der Key stand in der Datei und wurde trotzdem als „fehlt" angezeigt.

Das war kein Analyse-, sondern ein Parser-Problem: **ein Teil der Lücke schließt sich durch eine Umrechnung, nicht durch librosa.**

Die Umrechnung wurde nicht geraten, sondern aus den 497 Paaren (Open-Key-Tag ↔ Traktors `MUSICAL_KEY`) hergeleitet — 24 Notationen, jede eindeutig, keine Kollision:

| Open Key | 1m | 2m | … | 6m | … | 12m | 1d | … | 12d |
|---|---|---|---|---|---|---|---|---|---|
| Camelot | 8A | 9A | … | 1A | … | 7A | 8B | … | 7B |

Die Camelot-Zahl liegt **sieben Positionen weiter**, `m` → `A`, `d` → `B`:

```ts
const num = ((parseInt(openKeyNumber, 10) + 6) % 12) + 1;
```

Naheliegend wäre die Annahme gewesen, dass beide Systeme dieselbe Zahl benutzen — sie tun es nicht. Gegen alle 497 Paare geprüft: **497/497 korrekt, 0 ungeparst.**

Wirkung in Zahlen: **1155 Tracks** (24,4 % der Sammlung) zeigen ab sofort ihren Key, ohne dass eine Sekunde Audio analysiert wird. Für die verbleibenden **3583** ist Stufe 2 zuständig.

> `nml.ts` wurde laut `AGENTS.md` gegen NML v19 getestet; die vorliegende Collection ist **v20**. Beim Roundtrip (AP-C) gegen v20 gegenprüfen.

### 6.1 Der Analysator

`scripts/analyze.py` wird über `uv run --script` gestartet. Die Abhängigkeiten stehen als PEP-723-Block im Kopf der Datei, uv löst sie in einer eigenen Umgebung auf — SpotifyDLs Python bleibt unangetastet. Ausgabe ist eine JSON-Zeile je Datei:

```json
{"file":"…/track.mp3","bpm":174.28,"bpm_raw":174.28,"bpm_confidence":1.0,
 "key":"F#m","camelot":"11A","key_confidence":0.71,"duration":310.34}
```

- **BPM** — librosa, Median über drei Fenster à 45 s, verteilt über die mittleren 75 % des Tracks (Intro und Outro tragen oft kein stabiles Tempo). Danach Faltung ins Fenster 70–195 BPM gegen Halb- und Doppeltempo.
- **Key** — Chroma-CQT, gemittelt über dieselben Fenster, korreliert mit den 24 Rotationen eines Tonart-Profils. Camelot wird direkt mitgeliefert, damit `toCamelot()` den Wert ohne Umweg erkennt.
- **Ehrlichkeit über die Herkunft.** Geschätzte Werte werden als geschätzt markiert: `INFO ESTIMATED="bpm key"` in der NML, `bpmEstimated`/`keyEstimated` am `Track`, ein „geschätzt" im Inspector. `BPM_QUALITY` ist für Schätzungen bei 80 gedeckelt — 100 bleibt dem vorbehalten, was aus einem Tag oder aus Traktor stammt. Beim Re-Sync gewinnt Traktor immer.
- **Kosten.** Rund 3–4 s pro Track — bei 3583 Tracks etwa vier Stunden, die man kein zweites Mal laufen lassen will. Ein Cache über `Pfad|mtime|Größe|Dauer` (Muster: `coverCache`, `server.mjs:348`) liegt in `.analysis-cache.local.json`; ein Re-Import derselben Dateien kostet danach Sekunden statt Stunden. Ändert sich die Datei, ändert sich der Schlüssel und die Analyse läuft neu.

### 6.2 Gemessen: was die Analyse trifft

Blindtest, 29 tagfreie Kopien über 12 BPM-Bänder (71–190 BPM), Erwartung aus Traktors eigener Analyse. Reproduzierbar mit:

```bash
node scripts/eval-analysis.mjs <testordner>
```

| Konfiguration | BPM exakt | BPM brauchbar¹ | Key exakt |
|---|---|---|---|
| librosa-Standardprior (120 ± 1) | 44,8 % | 62,1 % | — |
| **Prior 140 ± 8 · Krumhansl-Schmuckler · CQT** ← Standard | **55,2 %** | **79,3 %** | **55,2 %** |
| Prior 150 ± 20 | 55,2 % | 79,3 % | — |
| Key-Profil Shaath | | | 44,8 % |
| Key-Profil Temperley | | | 41,4 % |
| Shaath + Perkussion entfernt | | | 44,8 % |
| Shaath + CENS-Chroma | | | 48,3 % |
| Shaath + Perkussion entfernt + CENS | | | 51,7 % |
| Krumhansl-Schmuckler + CENS-Chroma | | | 51,7 % |
| Krumhansl-Schmuckler + 5 Fenster à 60 s | 51,7 % | 79,3 % | 48,3 % |

¹ exakt oder Oktavfehler (halbes/doppeltes Tempo) — im DJ-Kontext meist noch brauchbar, weil das Raster stimmt.

Drei Ergebnisse, die gegen die Erwartung liefen und ohne Messung falsch entschieden worden wären:

1. **Der librosa-Standardprior ist das größte Einzelproblem.** `start_bpm=120, std_bpm=1` zieht schnelle Musik systematisch nach unten — ein 174-BPM-Track landet bei 117, weil das näher an 120 liegt. Ein breiter Prior kostet nichts und bringt zehn Punkte.
2. **Shaath verliert gegen Krumhansl-Schmuckler**, obwohl es ausdrücklich für elektronische Musik nachjustiert wurde und in KeyFinder steckt — hier zehn Punkte schlechter.
3. **Perkussion herauszurechnen bringt exakt null.** Die naheliegendste Verbesserung bei Musik mit lauten Drums, teuer in der Rechenzeit, ohne jede Wirkung. Mehr und längere Fenster machen es sogar schlechter.

**Einordnung.** BPM ist brauchbar: vier von fünf Tracks bekommen ein korrektes Raster, und der häufigste Fehler ist die Oktave, die beim Mixen nicht stört. Der Key trifft nur jeden zweiten Track — als Vorsortierung taugt das, als Grundlage fürs harmonische Mixen nicht. Wer es genau braucht, lässt Traktor analysieren; die Schätzung ist der Zwischenstand, bis das passiert ist. Genau dafür ist sie als Schätzung markiert.

`bpm_confidence` misst die Einigkeit der Analysefenster, **nicht** die Richtigkeit: ein Oktavfehler ist über den ganzen Track stabil und bekommt daher Konfidenz 1,0. Der Wert taugt zum Aussortieren unruhiger Tracks, nicht als Qualitätsaussage.

---

## 7. Traktor-Formatwissen

`nml.ts` liest heute `ENTRY`, `LOCATION`, `INFO`, `TEMPO`, `MUSICAL_KEY`, `ALBUM`. Für den Roundtrip fehlen Cues, Beatgrid und Nutzungsdaten.

> **Wichtig:** Das NML-Format ist von Native Instruments nicht dokumentiert. Die folgende Tabelle ist **Arbeitshypothese, nicht Referenz.** Jede Zeile wird durch ein Diff-Experiment bestätigt oder korrigiert, bevor Code darauf baut — und die Tabelle wird mit dem Ergebnis aktualisiert.

| Element | Vermutete Bedeutung | Status |
|---|---|---|
| `CUE_V2 @START` | Position in Millisekunden (Fließkomma) | zu bestätigen |
| `CUE_V2 @TYPE` | Cue-Art (Hotcue / Fade / Load / Grid / Loop); Zahlencodes unbekannt | **zu ermitteln** |
| `CUE_V2 @NAME` | Anzeigename des Hotcues | zu bestätigen |
| `CUE_V2 @HOTCUE` | Slot-Nummer, `-1` für keinen Slot | zu bestätigen |
| `CUE_V2 @LEN` | Loop-Länge in ms, `0` bei Punkt-Cues | zu bestätigen |
| Grid-Anker | Ein einzelner Cue markiert den Beat-1-Anker, das Raster ergibt sich aus Anker plus `TEMPO@BPM` | zu bestätigen |
| `INFO @RANKING` | Bewertung, Traktor-eigene Skala (nicht 1–5) | Skala zu ermitteln |
| `INFO @PLAYCOUNT` | Abspielzähler | zu bestätigen |

### Die Methode: Diff-Experiment

**Nicht** Lexicons Programm dekompilieren. Der schnellere, saubere und rechtlich unproblematische Weg ist, das Format selbst herzuleiten:

1. `collection.nml` kopieren als `vorher.nml`.
2. In Traktor **genau eine** Änderung machen — einen Hotcue auf Slot 3 setzen, sonst nichts.
3. Traktor beenden (schreibt beim Beenden), `nachher.nml` kopieren.
4. `diff vorher.nml nachher.nml` — was sich ändert, ist per Konstruktion genau dieses eine Feld.
5. Ergebnis in die Tabelle oben eintragen, mit Datum und Traktor-Version.

Ein Experiment pro Feld, jedes reproduzierbar, das Ergebnis ist Dokumentation statt Vermutung. Was Lexicon dabei beiträgt, ist die **Beobachtung des Verhaltens**: welches Feld landet beim Sync auf welchem Gegenstück, was wird bewusst nicht übertragen. Das ist Produktrecherche, kein Reverse Engineering.

Die bestätigte Tabelle ist das eigentliche Kapital dieses Vorhabens — Adapter für Rekordbox, Serato und Engine DJ sind danach Fleißarbeit.

---

## 8. Sync-Modell

```ts
interface SyncAdapter {
  id: "traktor" | "rekordbox" | "serato" | "engine";
  capabilities: Set<SyncField>;              // was dieses Ziel überhaupt kann
  read(): Promise<TrackState[]>;
  plan(changes: Change[]): Promise<DryRun>;  // schreibt nie
  apply(dryRun: DryRun): Promise<Applied>;   // nur nach Bestätigung
}
```

- **`capabilities` ist Pflicht.** Traktor hat einen Beatgrid-Anker, Rekordbox mehrere Punkte, Serato speichert in ID3-`GEOB`-Blobs. Ein Interface, das nur Traktors Modell abbildet, muss für den zweiten Adapter aufgebrochen werden — also jetzt so schneiden, dass beides passt.
- **Sync-State pro Track und Ziel** (`state.ts`): der letzte bekannte Stand. Nur so ist unterscheidbar, ob ein Feld sich geändert hat oder auf der einen Seite nie existierte.
- **Konflikte werden angezeigt, nicht aufgelöst.** Leitprinzip 4 im Pflichtenheft: Vorschlag, kein Autopilot.
- **v1 ist nur `traktor.ts`.** Rekordbox (XML, gut dokumentiert) ist der natürliche zweite Adapter — der klassische Traktor-zu-CDJ-Fall.

### Schreib-Sicherheit (nicht verhandelbar)

Aus `AGENTS.md:58`, gilt auch für den Server:

1. **Backup vor jedem Schreibvorgang** — `collection.<zeitstempel>.nml.bak`, nie überschreiben.
2. **Dry-Run zuerst** — der Nutzer sieht den Diff, bevor irgendetwas passiert.
3. **Atomar schreiben** — temporäre Datei, dann `rename`. Ein Absturz mitten im Schreiben darf keine halbe Collection hinterlassen.
4. **Nie in bestehende `<ENTRY>`-Trackdaten schreiben.** Nur Playlist-Knoten.
5. **Nicht schreiben, während Traktor läuft.** Traktor hält die Collection im Speicher und überschreibt beim Beenden.

---

## 9. Fahrplan

| AP | Inhalt | Fertig, wenn |
|---|---|---|
| **A** | Download in der Oberfläche: `/api/download`, Job-Queue, Tab „Laden" | Eine SoundCloud-Playlist landet in `Downloads/<Playlist>/`, das Log läuft live mit, der Ordner ist danach Musik-Quelle |
| **B** | `analyze.py`, BPM/Key beim Import | 20 taglose Tracks bekommen BPM und Key; BPM stimmt mit Traktor überein, die Key-Trefferquote ist gemessen und notiert |
| **C** | Traktor-Roundtrip: Cues/Grid lesen, Write-Back mit Backup und Dry-Run, `match.ts` | Dry-Run gegen eine Kopie zeigt nur Playlist-Knoten, Traktor öffnet die Collection fehlerfrei, Backup existiert |
| **D** | Sync-Engine: Adapter-Interface, `traktor.ts`, Konfliktanzeige | Ein in Traktor gesetzter Cue wird als Änderung erkannt, unveränderte Tracks lösen keinen Fehlalarm aus |
| **E** | Eine Oberfläche: Laden · Bibliothek · Planen · Sync · Health | Link → Download → Analyse → Set → Traktor, ohne das Fenster zu wechseln |

Die Reihenfolge ist nicht beliebig: **B hat die höchste Priorität.** Ohne BPM und Key ist die vorhandene Planungs-Engine auf Download-Material wirkungslos. A macht den Weg bequem, B macht ihn überhaupt erst sinnvoll.

## 10. Nicht-Ziele

- Kein Abspielen oder Mixen — bleibt Traktor.
- Keine Änderung an Audiodateien.
- Kein Cloud-Sync, keine Telemetrie, keine Netzwerkaufrufe der SPA außer zum lokalen Server.
- Keine Multi-Software-Adapter in v1 — nur das Interface, das sie später trägt.
- Keine Dekompilierung fremder Software.
