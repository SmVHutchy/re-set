# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["librosa>=0.11", "numpy>=1.26", "soundfile>=0.12", "audioread>=3.0"]
# ///
"""BPM- und Key-Analyse fuer Tracks ohne Tags.

Aufruf (uv laedt die Abhaengigkeiten isoliert, ohne eine vorhandene
Python-Umgebung zu veraendern):

    uv run --script scripts/analyze.py DATEI [DATEI ...]
    ... | uv run --script scripts/analyze.py --stdin

Ausgabe: eine JSON-Zeile pro Datei auf stdout, damit der Server sie wie
jeden anderen Kindprozess zeilenweise streamen kann. Fortschritt und
Fehler gehen nach stderr und stoeren die Datenzeilen nicht.

Bewusst defensiv: eine kaputte Datei liefert eine Zeile mit "error" und
bricht den Lauf nicht ab.
"""

import argparse
import json
import sys
import warnings

warnings.filterwarnings("ignore")

import numpy as np

# librosa zieht beim Import mehrere Sekunden — deshalb genau einmal pro
# Lauf, und der Aufrufer schickt moeglichst viele Dateien auf einmal.
import librosa


def _resolve_tempo():
    """Die Tempo-Funktion ist zwischen librosa-Versionen gewandert.

    0.10 kannte `librosa.beat.tempo`, ab 0.10.1 liegt sie unter
    `librosa.feature.rhythm.tempo`, und in 1.0 laedt `librosa.feature` seine
    Untermodule verzoegert — ein blosser Attributzugriff schlaegt dort fehl.
    Deshalb erst explizit importieren, dann die Alternativen probieren.
    """
    try:
        from librosa.feature.rhythm import tempo  # librosa >= 0.10.1

        return tempo
    except ImportError:
        pass
    if hasattr(librosa.beat, "tempo"):
        return librosa.beat.tempo  # librosa <= 0.10.0
    return None


_TEMPO = _resolve_tempo()


def tempo_of(onset, sr: int, start_bpm: float, std_bpm: float) -> float | None:
    """Tempo eines Ausschnitts; faellt notfalls auf beat_track zurueck.

    `std_bpm` ist die Breite des log-normalen Priors um `start_bpm`. Der
    librosa-Standard (120 ± 1) zieht schnelle Musik systematisch nach unten:
    ein 174-BPM-Track landet bei 117, weil das naeher an 120 liegt. Ein
    breiter Prior laesst die Daten entscheiden.
    """
    if _TEMPO is not None:
        t = _TEMPO(onset_envelope=onset, sr=sr, start_bpm=start_bpm, std_bpm=std_bpm)
        t = np.atleast_1d(t)
        return float(t[0]) if t.size else None
    t, _ = librosa.beat.beat_track(onset_envelope=onset, sr=sr, start_bpm=start_bpm)
    t = np.atleast_1d(t)
    return float(t[0]) if t.size else None


SR = 22050

# Tonart-Profile: Gewichte, wie stark jede Stufe in Dur bzw. Moll vertreten
# ist. Die Korrelation des Chroma-Mittels mit allen 24 Rotationen liefert die
# wahrscheinlichste Tonart. Welches Profil am besten trifft, haengt vom
# Material ab — deshalb waehlbar und gegen den Testsatz gemessen.
KEY_PROFILES = {
    # Krumhansl-Schmuckler: aus Hoerexperimenten mit klassischer Musik.
    "ks": (
        np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]),
        np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]),
    ),
    # Temperley/Kostka-Payne: aus einem Korpus notierter Musik gezaehlt.
    "temperley": (
        np.array([0.748, 0.060, 0.488, 0.082, 0.670, 0.460, 0.096, 0.715, 0.104, 0.366, 0.057, 0.400]),
        np.array([0.712, 0.084, 0.474, 0.618, 0.049, 0.460, 0.105, 0.747, 0.404, 0.067, 0.133, 0.330]),
    ),
    # Shaath: fuer elektronische Musik nachjustiert (Grundlage von KeyFinder).
    "shaath": (
        np.array([6.6, 2.0, 3.5, 2.3, 4.6, 4.0, 2.5, 5.2, 2.4, 3.7, 2.3, 3.4]),
        np.array([6.5, 2.7, 3.5, 5.4, 2.6, 3.5, 2.5, 5.2, 4.0, 2.7, 4.3, 3.2]),
    ),
}

# Schreibweisen, die src/lib/camelot.ts in NAME_TO_CAMELOT kennt.
MAJOR_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
MINOR_NAMES = ["Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"]

# Camelot direkt mitliefern, damit die Zuordnung nicht doppelt gepflegt
# werden muss, wenn ein anderer Konsument als Re:SET die Zeilen liest.
MAJOR_CAMELOT = ["8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B"]
MINOR_CAMELOT = ["5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A"]


def windows(total_s: float, count: int, length: float):
    """Analysefenster ueber den Track verteilen.

    Ein DJ-Set ist eine Stunde lang; es komplett zu laden kostet Minuten
    und bringt nichts. Drei Ausschnitte reichen — und ihre Streuung ist
    zugleich das ehrlichste Konfidenzmass, das ohne Referenz zu haben ist.
    Intro und Outro werden ausgespart (dort steht das Tempo oft still).
    """
    if total_s <= length * 1.5:
        return [(0.0, None)]
    span = total_s * 0.75
    start0 = total_s * 0.125
    step = (span - length) / max(1, count - 1)
    return [(start0 + i * step, length) for i in range(count)]


def fold_bpm(bpm: float, lo: float, hi: float) -> float:
    """Halb-/Doppeltempo in ein plausibles Fenster ziehen.

    Der klassische Fehler der Beat-Erkennung ist der Oktavfehler: 87 statt
    174. Nur echte Ausreisser werden korrigiert; das Fenster ist absichtlich
    weit, weil die Sammlung real von 71 (Reggae) bis 190 BPM (Jungle) reicht
    und ein enges Fenster mehr kaputtmacht, als es repariert.
    """
    if bpm <= 0:
        return bpm
    while bpm < lo:
        bpm *= 2
    while bpm >= hi:
        bpm /= 2
    return bpm


def estimate_key(chroma_mean: np.ndarray, profile_name: str):
    """Beste der 24 Tonarten plus Abstand zur zweitbesten als Konfidenz."""
    v = chroma_mean - chroma_mean.mean()
    norm = np.linalg.norm(v)
    if norm == 0:
        return None, None, 0.0
    v = v / norm

    prof_major, prof_minor = KEY_PROFILES[profile_name]
    scores = []
    for i in range(12):
        for profile, names, camelot in (
            (prof_major, MAJOR_NAMES, MAJOR_CAMELOT),
            (prof_minor, MINOR_NAMES, MINOR_CAMELOT),
        ):
            p = np.roll(profile, i)
            p = p - p.mean()
            p = p / np.linalg.norm(p)
            scores.append((float(np.dot(v, p)), names[i], camelot[i]))

    scores.sort(key=lambda s: s[0], reverse=True)
    best, second = scores[0], scores[1]
    # Abstand zur zweitbesten Tonart, auf 0..1 gestaucht. Ein knappes
    # Rennen zwischen Parallel-Tonarten ist genau der Fall, in dem die
    # Schaetzung mit Vorsicht zu geniessen ist.
    conf = 0.0 if best[0] <= 0 else min(1.0, max(0.0, (best[0] - second[0]) / abs(best[0])) * 3)
    return best[1], best[2], round(conf, 3)


def analyze(path: str, args) -> dict:
    total = librosa.get_duration(path=path)
    tempos = []
    chromas = []

    for offset, length in windows(total, args.windows, args.window_seconds):
        y, sr = librosa.load(path, sr=SR, mono=True, offset=offset, duration=length)
        if y.size < sr:  # unter einer Sekunde ist nichts zu holen
            continue
        onset = librosa.onset.onset_strength(y=y, sr=sr)
        t = tempo_of(onset, sr, args.start_bpm, args.std_bpm)
        if t:
            tempos.append(t)
        # Schlagzeug faerbt das Chroma-Bild ein und verschiebt die Tonart.
        # Die harmonische Komponente zu isolieren kostet Rechenzeit, ist bei
        # elektronischer Musik mit lauten Drums aber oft der Unterschied.
        y_h = librosa.effects.harmonic(y, margin=args.harmonic_margin) if args.harmonic else y
        chroma_fn = librosa.feature.chroma_cens if args.chroma == "cens" else librosa.feature.chroma_cqt
        chromas.append(chroma_fn(y=y_h, sr=sr).mean(axis=1))

    if not tempos or not chromas:
        raise ValueError("keine auswertbaren Audiodaten")

    raw = float(np.median(tempos))
    bpm = fold_bpm(raw, args.bpm_min, args.bpm_max)

    # Konfidenz aus der Streuung der Fenster: sind sich alle Ausschnitte
    # einig, ist die Schaetzung belastbar; driften sie, ist sie es nicht.
    if len(tempos) > 1:
        folded = [fold_bpm(t, args.bpm_min, args.bpm_max) for t in tempos]
        spread = (max(folded) - min(folded)) / max(1e-6, float(np.median(folded)))
        bpm_conf = round(max(0.0, 1.0 - spread * 4), 3)
    else:
        bpm_conf = 0.5

    key, camelot, key_conf = estimate_key(np.mean(chromas, axis=0), args.key_profile)

    return {
        "file": path,
        "bpm": round(bpm, 2),
        "bpm_raw": round(raw, 2),
        "bpm_confidence": bpm_conf,
        "key": key,
        "camelot": camelot,
        "key_confidence": key_conf,
        "duration": round(total, 2),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("files", nargs="*", help="zu analysierende Audiodateien")
    ap.add_argument("--stdin", action="store_true", help="Pfade zeilenweise von stdin lesen")
    ap.add_argument("--windows", type=int, default=3, help="Analysefenster pro Track (Standard 3)")
    ap.add_argument("--window-seconds", type=float, default=45.0, help="Laenge eines Fensters")
    # Standard ist ks: gegen den Testsatz gemessen die beste der drei
    # Varianten (55,2 % gegen 44,8 % shaath und 41,4 % temperley) — trotz der
    # Erwartung, dass ein auf elektronische Musik getrimmtes Profil vorn liegt.
    ap.add_argument("--key-profile", choices=sorted(KEY_PROFILES), default="ks",
                    help="Tonart-Profil (Standard ks — am Testsatz gemessen)")
    ap.add_argument("--chroma", choices=["cqt", "cens"], default="cqt", help="Chroma-Variante")
    ap.add_argument("--harmonic", action="store_true", help="Perkussion vor der Tonartschaetzung entfernen")
    ap.add_argument("--harmonic-margin", type=float, default=3.0, help="Trennschaerfe der Harmonic-Filterung")
    ap.add_argument("--start-bpm", type=float, default=140.0, help="Mitte des Tempo-Priors")
    ap.add_argument("--std-bpm", type=float, default=8.0, help="Breite des Tempo-Priors (gross = datengetrieben)")
    ap.add_argument("--bpm-min", type=float, default=70.0, help="untere Grenze der Tempo-Faltung")
    ap.add_argument("--bpm-max", type=float, default=195.0, help="obere Grenze der Tempo-Faltung")
    args = ap.parse_args()

    paths = list(args.files)
    if args.stdin:
        paths += [ln.strip() for ln in sys.stdin if ln.strip()]
    if not paths:
        ap.error("keine Dateien angegeben")

    for i, p in enumerate(paths, 1):
        print(f"[{i}/{len(paths)}] {p}", file=sys.stderr, flush=True)
        try:
            row = analyze(p, args)
        except Exception as e:  # eine kaputte Datei darf den Lauf nicht beenden
            row = {"file": p, "error": str(e)}
        print(json.dumps(row, ensure_ascii=False), flush=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())
