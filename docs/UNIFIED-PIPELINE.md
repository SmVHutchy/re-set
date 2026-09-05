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

Zwei Blindtests aus tagfreien Kopien mit bekannter Traktor-Analyse. Reproduzierbar mit `node scripts/eval-analysis.mjs <testordner>`.

- **Satz A** — 29 Tracks, über zwölf Tempo-Bänder **gleichverteilt**. Zeigt die Ränder, misst aber pessimistisch: langsame Tracks sind dort 20 %, in der Sammlung 1,8 %.
- **Satz B** — 60 Tracks, **zufällig gezogen** (Verteilung 80:1 · 120:4 · 130:14 · 140:30 · 150:7 · 160:2 · 170:2). Der Satz, der die Sammlung schätzt.

| | Satz A (Ränder) | Satz B (repräsentativ) |
|---|---|---|
| BPM exakt (± 2 %) | 55,2 % | **78,3 %** |
| BPM brauchbar (exakt + Oktave) | 79,3 % | 90,0 % |
| **Tonart exakt** | 55,2 % | **35,0 %** |

### Der Blocker war Arithmetik, nicht Musik

60 Tracks ergaben nur **14 verschiedene BPM-Werte**: 71,78 · 73,83 · 76 · 92,29 · 112,35 · 117,45 · 129,2 · 132,51 · 136 · 139,67 · 143,55 · 152 · 161,5 · 172,27.

Das ist librosas Tempogramm-Raster — `Tempo = 60 · Bildrate / ganzzahliger Versatz`. Bei Standard-Fensterung liegen die möglichen Werte um 145 BPM rund 3,5 BPM auseinander: **ein Track mit echten 147 BPM ist nicht darstellbar.** Jeder Fehlgriff, auf den sich beide Schätzer einigten, war genau dieser Rasterfehler — 2,3 bis 3,0 % daneben. Eine strengere Einigkeits-Toleranz half nicht (87,8 % bei 0,5 %, 1 % und 2 %), weil beide Verfahren denselben falschen Gitterpunkt trafen.

`refine_tempo()` verlässt das Raster über die mittleren Schlagabstände: der Quantisierungsfehler einzelner Abstände mittelt sich über viele Schläge heraus.

### Die Entscheidung über das Beatgrid

Zwei Schätzer, deren Übereinstimmung entscheidet, ob ein Grid geschrieben werden darf:

| Satz B, einige Teilmenge | ohne Verfeinerung | **mit Verfeinerung** |
|---|---|---|
| Abdeckung | 68,3 % | **61,7 %** (37 von 60) |
| davon exakt | 87,8 % | **100,0 %** (37 von 37) |
| davon Oktavfehler | 0 % | 0 % |
| davon falsch | 12,2 % | **0** |

**Damit darf AP-C für die einige Teilmenge ein Beatgrid schreiben.** Rund sechs von zehn Tracks kommen analysiert in Traktor an, die übrigen rechnet Traktor selbst.

**Was 37 von 37 nicht heißt.** Null Fehler in 37 Fällen ist mit einer wahren Fehlerquote von bis zu **rund 8 %** vereinbar (Dreierregel, 95 % einseitig). Der Punktschätzer ist 100 %, die belastbare Untergrenze liegt bei etwa 92 %. Für eine größere Sicherheit braucht es einen größeren Satz — die Grundwahrheit dafür liegt vor (497 Tracks), es kostet nur Rechenzeit.

**Was nicht geschrieben werden darf.** Die Tonart trifft in Satz B nur **35 %**. Sie geht als Schätzung mit und wird als solche markiert, aber sie ist keine Grundlage fürs harmonische Mixen — dafür bleibt Traktors eigene Analyse maßgeblich.

### Was dabei widerlegt wurde

- **Der librosa-Standardprior** (120 ± 1) zieht schnelle Musik nach unten: ein 174-BPM-Track landet bei 117. Ein breiter Prior bringt zehn Punkte.
- **Shaath**, ausdrücklich für elektronische Musik gemacht, liegt zehn Punkte hinter dem klassischen Krumhansl-Schmuckler.
- **Perkussion vor der Tonartschätzung zu entfernen bringt null**, bei deutlich höherer Rechenzeit. Mehr und längere Fenster machen es schlechter.
- **„Uneinigkeit heißt immer falsch"** galt in Satz A (0 von 7 richtig) und ist in Satz B widerlegt: dort sind 43,5 % der uneinigen Tracks trotzdem exakt. Ein Kleinstichproben-Artefakt — Uneinigkeit ist ein Grund, kein Grid zu schreiben, kein Beweis für einen Fehler.

`bpm_confidence` misst die Einigkeit der Analysefenster, **nicht** die Richtigkeit: ein Oktavfehler ist über den ganzen Track stabil und bekommt Konfidenz 1,0.

---

## 7. Traktor-Formatwissen

`nml.ts` liest `ENTRY`, `LOCATION`, `INFO`, `TEMPO`, `MUSICAL_KEY`, `ALBUM` — und seit AP-D auch `CUE_V2` und `PLAYCOUNT`.

> Das NML-Format ist von Native Instruments nicht dokumentiert. Die Tabelle unten ist **nicht geraten**, sondern aus einer echten Collection ausgezählt: 588 Tracks mit Cues, 679 Cues insgesamt. Was systematisch zusammen auftritt, ist die Bedeutung. Nicht belegte Zeilen sind als solche markiert und dürfen nicht in Code einfließen.

### Belegt (Auszählung, 2026-09-05)

| Element | Bedeutung | Beleg |
|---|---|---|
| `CUE_V2 @START` | Position in **Millisekunden**, Fließkomma | 679/679 Cues liegen als ms innerhalb der Trackdauer; als Sekunden gelesen nur 456 (67 %) |
| `CUE_V2 @TYPE="4"` | **Grid-Anker** | 597 Stück, Name stets „AutoGrid" oder „Beat Marker", nie ein Slot, nie eine Länge; 586 der 597 liegen in den ersten vier Beats |
| `CUE_V2 @TYPE="0"` | **Hotcue** (Punkt) | 79 Stück, davon 100 % mit Slot und 0 % mit Länge |
| `CUE_V2 @TYPE="5"` | **Loop** | 3 Stück, 100 % mit Slot **und** Länge |
| `CUE_V2 @HOTCUE` | Slot 0–7, `-1` heißt „kein Slot" | beobachtete Werte: −1 (597×) und 0–7 |
| `CUE_V2 @LEN` | Loop-Länge in ms, `0` bei Punkt-Cues | nur bei TYPE=5 grösser als 0 |
| Vorhandene Attribute | `NAME`, `DISPL_ORDER`, `TYPE`, `START`, `LEN`, `REPEATS`, `HOTCUE` | vollständige Auszählung über alle `CUE_V2` |

### Der Fund, der das Interface gerettet hat

**Ein Track kann mehrere Grid-Anker haben.** 586 der 588 Tracks tragen genau einen — aber einer hat fünf und einer sechs (manuell korrigierte Raster). Die naheliegende Modellierung „Traktor: ein Anker, Rekordbox: mehrere Punkte" ist damit falsch, und ein `gridAnchorMs: number` im Adapter hätte bei genau diesen Tracks Daten verschluckt. `TrackState.gridAnchorsMs` ist deshalb eine Liste.

### Nicht belegt — offen

| Element | Stand |
|---|---|
| `CUE_V2 @TYPE` 1, 2, 3 | in den Daten **nicht vorgekommen**. Traktors Oberfläche kennt Fade-In, Fade-Out und Load — welche Zahl welche ist, bleibt offen |
| `CUE_V2 @REPEATS` | vorhanden, Bedeutung ungeklärt |
| `CUE_V2 @DISPL_ORDER` | vorhanden, vermutlich Anzeigereihenfolge — ungeprüft |
| `INFO @RANKING` | nur **ein** Wert in der ganzen Collection (25, bei 16 Tracks). Mit einem Datenpunkt ist keine Skala bestimmbar |
| `INFO @PLAYCOUNT` | Werte 1 und 2 — plausibel ein Zähler, aber die Spanne ist zu klein für eine Aussage |

Diese Zeilen schließt das Diff-Experiment, sobald du in Traktor einen Fade-Cue setzt und einen Track bewertest.

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

- **`capabilities` ist Pflicht.** Serato speichert in ID3-`GEOB`-Blobs, Engine DJ in SQLite, jedes Ziel kann andere Felder. Ein Interface, das nur Traktors Modell abbildet, muss für den zweiten Adapter aufgebrochen werden. Der Traktor-Adapter meldet acht Felder und lässt `comment` bewusst weg: dort schreibt Re:SET beim Export selbst (Phase · Energie · Vibes), ein Abgleich würde die eigenen Notizen gegen sich selbst ausspielen.
- **Sync-State pro Track und Ziel** (`state.ts`): der letzte bekannte Stand, in `localStorage` unter `reset.sync.snapshot.<adapter>`. Nur so ist unterscheidbar, ob ein Feld sich geändert hat oder auf der einen Seite nie existierte.
- **Vergleich mit Toleranz.** Cue-Positionen werden auf 10 ms gerundet verglichen. Traktor schreibt Fließkommawerte; ein Unterschied in der zwölften Nachkommastelle ist keine Änderung, die jemanden interessiert, und 10 ms liegen weit unter allem Hörbaren. Ohne diese Rundung meldet jeder Abgleich Hunderte Fehlalarme.
- **Konflikte werden angezeigt, nicht aufgelöst.** `findConflicts()` ist ein Drei-Wege-Vergleich: ein Konflikt entsteht nur, wenn dasselbe Feld sich seit dem gemeinsamen Stand auf beiden Seiten **unterschiedlich** geändert hat. Gleiche Änderung auf beiden Seiten ist keiner. Leitprinzip 4 im Pflichtenheft: Vorschlag, kein Autopilot.
- **`apply()` wirft, solange AP-C fehlt.** Der Write-Back in eine bestehende `collection.nml` ist nicht gebaut; der Adapter sagt das mit einer verständlichen Meldung, statt still nichts zu tun. Ein Sync, der lautlos nichts schreibt, ist schlimmer als einer, der fehlt.
- **v1 ist nur `traktor.ts`.** Rekordbox (XML, gut dokumentiert) ist der natürliche zweite Adapter — der klassische Traktor-zu-CDJ-Fall.

**Geprüft** (17 konstruierte Fälle, `scratchpad/sync-test.mjs`): BPM-Änderung, Hotcue hinzugefügt, Hotcue um 500 ms verschoben, Grid-Anker dazugekommen, Playlist dazugekommen — alle erkannt. Umsortierte Cues, umsortierte Playlists und 2 ms Fließkomma-Rauschen — kein Fehlalarm. Konflikt nur bei beidseitig unterschiedlicher Änderung.

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
