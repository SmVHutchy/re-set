# Hyper-Prompt — Re:SET × SpotifyDL

Ausführbare Aufträge für die Arbeitspakete aus [UNIFIED-PIPELINE.md](UNIFIED-PIPELINE.md).

**Benutzung:** § 1 (Kontext) und § 2 (Regeln) immer voranstellen, dann **genau einen** Auftrag aus § 3 anhängen. Ein Arbeitspaket pro Lauf — die Pakete bauen aufeinander auf, und ein Agent, der A bis E in einem Rutsch versucht, liefert fünf halbe Sachen.

Empfohlene Reihenfolge: **B → A → C → D → E.** B zuerst, weil ohne BPM und Key die vorhandene Planungs-Engine auf Download-Material wirkungslos ist.

---

## 1. Kontext-Block (immer voranstellen)

> Du arbeitest an **Re:SET**, einem lokal laufenden, Cover-zentrierten Set-Planer für Traktor Pro 4.
>
> **Arbeitsverzeichnis:** `H:\Projekte\SONG ORGINIZER` · Branch `feat/unified-pipeline`
> **Zweites Projekt:** `H:\Projekte\SpotifyDL` — Python (uv), spotdl + streamrip. **Read-only**, außer der Auftrag sagt ausdrücklich etwas anderes.
>
> **Lies zuerst, in dieser Reihenfolge:**
> 1. `AGENTS.md` — verbindliche Konventionen, keine Ausnahmen
> 2. `docs/UNIFIED-PIPELINE.md` — Architektur, API-Vertrag, Formatwissen
> 3. Die im Auftrag genannten Quelldateien
>
> **Stack:** React 19 + TypeScript (strict) + Vite + Tailwind v4, Express-Backend in `scripts/server.mjs`, Persistenz über `src/lib/store/storage.ts` (localStorage).
>
> **Was bereits existiert und wiederverwendet werden muss statt neu gebaut:**
> - `scripts/server.mjs:63` — `/api/import`: Kindprozess mit zeilenweisem NDJSON-Log. **Das Muster für jeden neuen Streaming-Endpunkt.**
> - `scripts/server.mjs:281` — `resolveTraktorPath()`: löst Traktor-`LOCATION` über Boot-Volume, Windows-Laufwerk, `/Volumes` und einen Dateinamen-Index auf.
> - `scripts/server.mjs:348` — `coverCache`: Cache-Muster über `Pfad|mtime|size`.
> - `src/lib/export.ts` — `groupByPhase()`, `nmlSinglePlaylist()`, `nmlPlaylists()`, `m3u()`. Alle Exporte gehen über `groupByPhase()`.
> - `src/lib/nml.ts` — defensiver NML-Parser. Fehlende Felder werden `null`, **er wirft nie.**
> - `src/lib/camelot.ts` · `compat.ts` · `autoset.ts` — Key-Mapping, Kompatibilitätsscore, Auto-Reihenfolge.
> - `src/components/ImportButton.tsx` — NDJSON-Leseschleife auf Client-Seite.
> - `H:\Projekte\SpotifyDL\dashboard.py:96` — `build_command()`: erprobte Format- und Bitratenmatrix für spotdl/streamrip.

## 2. Harte Regeln

**Sicherheit**

1. Prozessstart **immer** mit Argument-Array, **nie** `shell: true`, nie String-Konkatenation. URLs und Ordnernamen sind Nutzereingaben.
2. Die echte `collection.nml` des Nutzers wird **nie** gelesen oder geschrieben. Entwicklung und Tests laufen gegen eine Kopie.
3. Jeder Schreibvorgang an einer Collection: Backup zuerst, Dry-Run-Vorschau, atomar schreiben (temp + `rename`), niemals bestehende `<ENTRY>`-Trackdaten verändern.
4. Audiodateien werden nie verändert.
5. Keine Netzwerkaufrufe der SPA außer zum lokalen Server. Keine Telemetrie. Kein `dangerouslySetInnerHTML`.

**Stil**

6. Farben und Fonts **nur** über `@theme`-Tokens in `src/index.css`. Kein Inline-Hex, kein `oklch()`, kein `rgb()`. Fehlt ein Token, erst benennen, dann verwenden.
7. Icons nur `@phosphor-icons/react`. **Keine Emojis, nirgends.** Fonts nur Geist Sans und Geist Mono.
8. UI in `src/components/`, Logik in `src/lib/`. Kommentare auf Deutsch wie im Bestand, und sie erklären *warum*, nicht *was*.
9. npm, nicht pnpm oder yarn. Keine Abhängigkeit hinzufügen, ohne vorher `package.json` zu prüfen; wenn doch, Lockfile mitcommitten.

**Ablauf**

10. Verifikation vor „fertig": `npm run typecheck && npm run build`. Es gibt keinen Test-Runner und keinen Linter — **keine erfinden.**
11. Committen nur auf ausdrückliche Aufforderung.
12. Wenn eine Annahme über das NML-Format nötig wird: erst per Diff-Experiment (§ 4) bestätigen, dann `docs/UNIFIED-PIPELINE.md` § 7 aktualisieren, dann Code schreiben. Nicht raten.

---

## 3. Aufträge

### AP-B — Analyse: BPM und Key *(zuerst)*

> **Auftrag:** 76,3 % der Download-Sammlung tragen weder BPM- noch Key-Tag (gemessen, siehe `UNIFIED-PIPELINE.md` §6.0), und `import-music.mjs:113` liest beides nur aus Tags. Damit laufen `compat.ts`, `autoset.ts` und die Energie-Timeline auf dem Großteil der Bibliothek leer. Schließe diese Lücke — in zwei Stufen, die billige zuerst.
>
> **Stufe 1 — Open Key parsen (kein librosa nötig):** Die vorhandenen Key-Tags stehen durchgängig in Open-Key-Notation (`1m`–`12m` = Moll, `1d`–`12d` = Dur). `toCamelot()` in `src/lib/camelot.ts` erkennt sie nicht und verwirft sie, obwohl der Wert in der Datei steht — betrifft rund ein Viertel der Sammlung. Open Key nach Camelot ist eine reine Umbenennung: dieselbe Zahl, `m` → `A`, `d` → `B`. Ergänzen, testen, fertig. **Diese Stufe zuerst, sie kostet Minuten und schließt ein Viertel der Lücke.**
>
> **Stufe 2 — Analyse bauen:**
> - `scripts/analyze.py`, ausgeführt in der uv-Umgebung von SpotifyDL (`H:\Projekte\SpotifyDL\bin\uv.exe run python …`). Eingabe: Dateipfade als Argumente oder über stdin. Ausgabe: **eine JSON-Zeile pro Datei** auf stdout, damit der Server sie wie jeden anderen Kindprozess-Log zeilenweise streamen kann:
>   ```json
>   {"file":"…","bpm":174.0,"bpm_confidence":0.94,"key":"F#m","camelot":"11A","key_confidence":0.71}
>   ```
> - BPM über librosa `beat.beat_track`, mit **Halb-/Doppeltempo-Plausibilisierung** gegen ein konfigurierbares Fenster. Ohne diese Korrektur liefert die Analyse bei DnB systematisch 87 statt 174.
> - Key über Chroma + Krumhansl-Schmuckler, oder essentia `KeyExtractor` falls installierbar. Die Camelot-Zuordnung aus `src/lib/camelot.ts` spiegeln, nicht zweitdefinieren.
> - `import-music.mjs`: neue Flag `--analyze`. Fehlen `c.bpm` oder `c.key`, kommt die Datei in den Analyse-Batch; das Ergebnis wird in `<TEMPO BPM>` und `<INFO KEY>` geschrieben — dieselben Felder, die `nml.ts` bereits liest. **Kein neues Schema.**
> - **Herkunft markieren:** geschätzte Werte bekommen ein eigenes Attribut (analog zu `LUFS`/`HFMAX` aus dem Deep-Scan), `nml.ts` liest es, Inspector und Health zeigen es an. Traktor-Werte gewinnen immer.
> - Cache über `Pfad|mtime|size` (Muster `coverCache`, `server.mjs:348`) — Analyse ist zu teuer, um sie zu wiederholen.
> - `POST /api/analyze` als NDJSON-Endpunkt, gebaut wie `/api/import`.
>
> **Blindtest-Protokoll:** Die 497 Tracks mit Traktor-Analyse tragen die Werte inzwischen selbst als Tag — ein Test darauf würde die Antwort ablesen. Gemessen wird deshalb auf **tagfreien Kopien** (`ffmpeg -map_metadata -1 -c copy`) mit der Erwartung in einer danebenliegenden `expected.json`. Ein fertiger Satz liegt bereit: 29 Tracks über 12 BPM-Bänder von 71 bis 190 BPM. Auswertung: BPM als exakter Treffer / Halb- oder Doppeltempo / falsch, Key als Treffer / Parallele (relative Dur-Moll) / falsch. **Beide Quoten gehören nach `docs/UNIFIED-PIPELINE.md` §6.0**, mit Datum und Stichprobengröße.
>
> **Fertig, wenn:** Stufe 1 zeigt Keys für die bereits getaggten Tracks · `node scripts/import-music.mjs "<Ordner>" --analyze` setzt BPM und Key für taglose Tracks · der Blindtest ist gelaufen und **beide Trefferquoten sind notiert** · geschätzte Werte sind in der UI als geschätzt erkennbar · `npm run typecheck && npm run build` grün.
>
> **Nicht:** kein eigenes Analyse-UI, keine Stimmungs-/Genre-Erkennung, kein Schreiben in Audiodateien.

---

### AP-A — Download in der Oberfläche

> **Auftrag:** Heute läuft der Download in einem separaten Python-Dashboard. Hole ihn in Re:SET, ohne die Python-Engine zu portieren.
>
> **Bauen:**
> - `POST /api/download` in `server.mjs`, Body `{ url, source, format, bitrate, targetDir? }`. Spawnt `H:\Projekte\SpotifyDL\bin\uv.exe` mit `run spotdl …` bzw. `run rip …` — **Argument-Array, kein Shell** — und streamt jede Ausgabezeile als NDJSON, exakt wie `/api/import`.
> - Die Format- und Bitratenmatrix und die Quellenerkennung anhand der URL stehen fertig in `H:\Projekte\SpotifyDL\dashboard.py:70` (`url_engine`) und `:96` (`build_command`). Übernehmen, nicht neu erfinden.
> - **Playlist wird Ordnername:** spotdl-Output-Template `{list-name}/{artist} - {title}.{output-ext}`. Damit ist der Ordnername identisch mit dem `FOLDER`-Gruppenlabel, das `import-music.mjs:104` schreibt — Download und Bibliothek rasten ohne Zusatzlogik ineinander. Liefert die Quelle keinen Listennamen, Ordner aus Datum und Quelle bilden; nie flach nach `Downloads/`.
> - **Job-Queue:** ein Lauf gleichzeitig, Warteschlange im Speicher, `GET /api/jobs`, `DELETE /api/jobs/:id`. Drei parallele spotdl-Läufe sättigen die Platte.
> - Nach Abschluss: Zielordner automatisch als Musik-Quelle registrieren (`POST /api/sources` existiert, `server.mjs:252`) und den Import anstoßen.
> - UI: `src/components/DownloadPanel.tsx` — URL-Feld, Quelle/Format/Qualität, Live-Log, Queue-Anzeige. Die NDJSON-Leseschleife aus `ImportButton.tsx` **als Hook `useNdjsonStream` herausziehen und in beiden verwenden**, nicht kopieren.
>
> **Fertig, wenn:** `npm run server`, eine kurze SoundCloud-Playlist geladen → Dateien liegen in `Downloads/<Playlist-Name>/` · das Log lief live mit · der Ordner erscheint danach ohne Zutun als Musik-Quelle in der Bibliothek · ein zweiter Auftrag wartet, statt parallel zu starten · Abbrechen beendet den Kindprozess wirklich · `npm run typecheck && npm run build` grün.
>
> **Nicht:** keine Logins/Zugangsdaten in der UI (Tidal/Qobuz/Deezer bleiben in `config/streamrip.toml`), keine Änderung an SpotifyDL selbst, kein Ersatz für `overnight.py`.

---

### AP-C — Traktor-Roundtrip

> **Auftrag:** Re:SET exportiert heute NML-Playlist-**Dateien** zum manuellen Import in Traktor. Baue den echten Roundtrip: Cues und Beatgrid lesen, Playlists sicher in eine bestehende `collection.nml` schreiben.
>
> **Vorher:** Für jedes Feld, dessen Bedeutung nicht gesichert ist, das Diff-Experiment aus § 4 durchführen und `docs/UNIFIED-PIPELINE.md` § 7 aktualisieren. Erst dann Code.
>
> **Bauen:**
> - `nml.ts` erweitern: `CUE_V2` (Name, Typ, Position, Slot, Loop-Länge), Beatgrid-Anker, `RANKING`, `PLAYCOUNT`, `IMPORT_DATE`. Defensiv bleiben — der Parser wirft nie, unbekannte Felder werden `null`.
> - `src/lib/match.ts` — Track-Identität in drei Stufen: 1. `LOCATION`-Konkatenation, 2. Dateiname + Dauer, 3. Hash der ersten N Sekunden Audio. Grundlage für Re-Sync und AP-D.
> - `src/lib/nml-write.ts` plus `POST /api/traktor/dry-run` und `POST /api/traktor/write`. **Das Schreiben passiert im Server, nicht im Browser.** Pflicht: Backup (`collection.<zeitstempel>.nml.bak`), Dry-Run-Diff, atomares Schreiben, Abbruch wenn Traktor läuft oder die Datei gesperrt ist, und **nur Playlist-Knoten anfassen**.
> - Reihenfolge der Arbeit: erst der Dry-Run und seine Vorschau, gegen eine **Kopie**. Der Write-Pfad wird erst gebaut, wenn der Diff nachweislich sauber ist.
>
> **Fertig, wenn:** Dry-Run gegen eine Kopie zeigt ausschließlich hinzugefügte Playlist-Knoten · nach dem Schreiben öffnet Traktor die Collection fehlerfrei und die Playlist ist da · die Trackdaten sind byte-identisch geblieben · das Backup existiert · ein laufendes Traktor blockiert den Schreibvorgang mit verständlicher Meldung · `npm run typecheck && npm run build` grün.
>
> **Nicht:** keine Cues/Beatgrids schreiben (nur lesen — Schreiben ist AP-D), keine `<ENTRY>`-Trackdaten ändern, kein Tauri.

---

### AP-D — Sync-Engine (Lexicon-Parität)

> **Auftrag:** Baue die Grundlage für den bidirektionalen Bibliotheks-Sync — die Funktion, für die man sonst Lexicon kauft. In v1 nur Traktor, aber mit einem Interface, das Rekordbox, Serato und Engine DJ später trägt.
>
> **Methodik, ausdrücklich:** Lexicons Programm wird **nicht** dekompiliert. Erkenntnisquelle sind (a) Diff-Experimente an den Formaten selbst (§ 4) und (b) die Beobachtung, welches Feld beim Sync auf welchem Gegenstück landet. Das ist reproduzierbar, rechtlich unproblematisch und ergibt am Ende bessere Dokumentation.
>
> **Bauen:**
> - `src/lib/sync/adapter.ts` — `SyncAdapter` mit `capabilities`, `read()`, `plan()` (schreibt nie), `apply()` (nur nach Bestätigung). **`capabilities` ist Pflicht:** Traktor hat einen Beatgrid-Anker, Rekordbox mehrere Punkte, Serato ID3-`GEOB`-Blobs. Das Interface muss beides tragen, sonst wird es beim zweiten Adapter aufgebrochen.
> - `src/lib/sync/state.ts` — letzter bekannter Stand pro Track und Ziel. Nur damit ist unterscheidbar, ob ein Feld sich geändert hat oder auf einer Seite nie existierte.
> - `src/lib/sync/traktor.ts` — der erste Adapter, auf `nml.ts` und `nml-write.ts` aus AP-C.
> - Konflikte werden **angezeigt, nicht aufgelöst** (Leitprinzip 4 im Pflichtenheft). Der Nutzer entscheidet pro Feld.
> - Jede bestätigte Formaterkenntnis wandert nach `docs/UNIFIED-PIPELINE.md` § 7.
>
> **Fertig, wenn:** ein in Traktor gesetzter Cue wird beim Re-Sync als genau diese eine Änderung erkannt · unveränderte Tracks lösen keinen Fehlalarm aus · ein beidseitig geändertes Feld erscheint als Konflikt mit beiden Werten · nichts wird ohne Bestätigung geschrieben · `npm run typecheck && npm run build` grün.
>
> **Nicht:** keine Rekordbox-/Serato-/Engine-Adapter in v1, kein automatisches Auflösen von Konflikten, keine Dekompilierung.

---

### AP-E — Eine Oberfläche

> **Auftrag:** Führe die Ansichten zu einem Fenster zusammen: **Laden · Bibliothek · Planen · Sync · Health.**
>
> **Bauen:**
> - Navigation in `src/App.tsx`. Die vorhandenen Views wandern **unverändert** unter „Planen" und „Bibliothek" — dieses Paket ist Zusammenführung, kein Redesign.
> - `start-reset.bat` / `start-reset.command` starten Server und Browser; SpotifyDLs eigener Starter wird überflüssig.
> - Leerzustände: „Laden" ohne Downloads, „Sync" ohne konfigurierte Collection — jeder Tab sagt, was als Nächstes zu tun ist.
> - § 2 Regel 6–8 gelten hier besonders: nur Tokens, nur Phosphor, keine Emojis.
>
> **Fertig, wenn:** ein kompletter Durchlauf ohne Fensterwechsel gelingt — Link → Download → Analyse → Set planen → NML exportieren → in Traktor spielbar · Tastatur-Shortcuts und Mini-Player funktionieren über alle Tabs · `npm run typecheck && npm run build` grün.
>
> **Nicht:** kein Redesign bestehender Views, keine neuen Planungsfunktionen.

---

## 4. Protokoll: Diff-Experiment

Für jedes NML-Feld, dessen Bedeutung nicht gesichert ist. Ein Feld pro Durchlauf — zwei Änderungen gleichzeitig machen das Ergebnis wertlos.

```bash
cp "<pfad>/collection.nml" vorher.nml
# In Traktor GENAU EINE Änderung machen. Traktor beenden (schreibt beim Beenden).
cp "<pfad>/collection.nml" nachher.nml
diff vorher.nml nachher.nml
```

Ergebnis als Zeile in `docs/UNIFIED-PIPELINE.md` § 7 eintragen:

| Feld | Experiment | Beobachtung | Traktor-Version | Datum |
|---|---|---|---|---|
| `CUE_V2 @TYPE` | Hotcue auf Slot 3 gesetzt | *(Diff-Ausgabe)* | *(Version)* | *(Datum)* |

Der Status wechselt dabei von „zu ermitteln" auf „bestätigt". Nur bestätigte Felder dürfen in Code einfließen.
