// Misst die Analyse gegen eine Grundwahrheit.
//
//   node scripts/eval-analysis.mjs <testordner> [-- <analyze.py-Optionen>]
//
// Der Testordner enthaelt tagfreie Audiodateien und eine expected.json mit
// {test, bpm, keyOpen} je Datei. Tagfrei ist Bedingung: traegt die Datei die
// Werte selbst, liest der Analysator die Antwort ab, statt sie zu berechnen.
//
// Gewertet wird nach den ueblichen Kategorien der Musikinformatik, nicht nach
// "richtig/falsch": ein Oktavfehler (halbes/doppeltes Tempo) und eine
// Parallel-Verwechslung (Dur/Moll mit gleichen Vorzeichen) sind fachlich etwas
// anderes als ein Fehlgriff — und im DJ-Kontext meist noch brauchbar.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node scripts/eval-analysis.mjs <testordner> [-- <analyze-optionen>]");
  process.exit(1);
}
const passThrough = process.argv.includes("--")
  ? process.argv.slice(process.argv.indexOf("--") + 1)
  : [];

const expected = JSON.parse(fs.readFileSync(path.join(dir, "expected.json"), "utf-8"));
const byFile = new Map(expected.map((e) => [e.test, e]));

// Open Key -> Camelot, identisch zu src/lib/camelot.ts.
const openToCamelot = (k) => {
  const m = /^(0?[1-9]|1[0-2])\s*([dm])$/i.exec(String(k ?? "").trim());
  if (!m) return null;
  return `${((parseInt(m[1], 10) + 6) % 12) + 1}${m[2].toLowerCase() === "m" ? "A" : "B"}`;
};

const files = expected.map((e) => path.join(dir, e.test));
const args = ["run", "--script", "scripts/analyze.py", ...passThrough, ...files];

const rows = await new Promise((resolve, reject) => {
  const child = spawn("uv", args, { cwd: process.cwd() });
  const out = [];
  let buf = "";
  child.stdout.on("data", (c) => {
    buf += c.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) if (l.trim()) out.push(JSON.parse(l));
  });
  child.stderr.on("data", (c) => process.stderr.write(c));
  child.on("error", reject);
  child.on("close", () => {
    if (buf.trim()) out.push(JSON.parse(buf));
    resolve(out);
  });
});

// --- BPM -------------------------------------------------------------------
// Toleranz 2 % ist der uebliche Wert: Traktor und librosa runden verschieden,
// eine Abweichung von 174.28 zu 174.0 ist kein Fehler.
const near = (a, b) => Math.abs(a - b) / b < 0.02;

let bpmExact = 0;
let bpmOctave = 0;
let bpmWrong = 0;
// Die Teilmenge, in der beide Schaetzer dasselbe sagen. Nur sie entscheidet,
// ob wir Beatgrids schreiben duerfen: ein falsches Grid rechnet Traktor nicht
// nach, der Versatz faellt erst beim Auflegen auf.
let agreeN = 0;
let agreeExact = 0;
let agreeOctave = 0;
let agreeWrong = 0;
let disagreeN = 0;
let disagreeExact = 0;
let keyExact = 0;
let keyRelative = 0;
let keyWrong = 0;
const misses = [];

for (const r of rows) {
  const e = byFile.get(path.basename(r.file));
  if (!e || r.error) {
    bpmWrong++;
    keyWrong++;
    misses.push({ test: e?.test ?? r.file, fehler: r.error ?? "keine Erwartung" });
    continue;
  }

  let bpmVerdict;
  if (near(r.bpm, e.bpm)) {
    bpmExact++;
    bpmVerdict = "exakt";
  } else if (near(r.bpm * 2, e.bpm) || near(r.bpm / 2, e.bpm)) {
    bpmOctave++;
    bpmVerdict = "Oktave";
  } else {
    bpmWrong++;
    bpmVerdict = "falsch";
  }

  const soll = openToCamelot(e.keyOpen);
  const ist = r.camelot;
  let keyVerdict;
  if (ist && soll && ist === soll) {
    keyExact++;
    keyVerdict = "exakt";
  } else if (ist && soll && ist.slice(0, -1) === soll.slice(0, -1)) {
    // Gleiche Zahl, anderer Buchstabe = Paralleltonart. Auf dem Camelot-Rad
    // benachbart, harmonisch meist noch mischbar.
    keyRelative++;
    keyVerdict = "parallel";
  } else {
    keyWrong++;
    keyVerdict = "falsch";
  }

  if (r.bpm_agree === true) {
    agreeN++;
    if (bpmVerdict === "exakt") agreeExact++;
    else if (bpmVerdict === "Oktave") agreeOctave++;
    else agreeWrong++;
  } else if (r.bpm_agree === false) {
    disagreeN++;
    if (bpmVerdict === "exakt") disagreeExact++;
  }

  if (bpmVerdict !== "exakt" || keyVerdict !== "exakt") {
    misses.push({
      test: e.test,
      bpm: `${r.bpm} statt ${e.bpm} (${bpmVerdict})`,
      key: `${ist} statt ${soll} (${keyVerdict})`,
      bpmKonf: r.bpm_confidence,
      keyKonf: r.key_confidence,
    });
  }
}

const n = rows.length;
const pct = (x) => `${((x / n) * 100).toFixed(1)} %`;
console.log(`\nOptionen: ${passThrough.join(" ") || "(Standard)"}`);
console.log(`Tracks: ${n}\n`);
console.log(`BPM exakt (±2 %)      : ${bpmExact}  ${pct(bpmExact)}`);
console.log(`BPM Oktavfehler       : ${bpmOctave}  ${pct(bpmOctave)}`);
console.log(`BPM falsch            : ${bpmWrong}  ${pct(bpmWrong)}`);
console.log(`  brauchbar (exakt+Okt): ${bpmExact + bpmOctave}  ${pct(bpmExact + bpmOctave)}`);
console.log(`Key exakt             : ${keyExact}  ${pct(keyExact)}`);
console.log(`Key parallel          : ${keyRelative}  ${pct(keyRelative)}`);
console.log(`Key falsch            : ${keyWrong}  ${pct(keyWrong)}`);

if (agreeN || disagreeN) {
  const p = (x, base) => (base ? `${((x / base) * 100).toFixed(1)} %` : "—");
  console.log(`
--- Zweiter Schaetzer: Uebereinstimmung ---`);
  console.log(`beide einig           : ${agreeN} von ${n}  (${p(agreeN, n)} Abdeckung)`);
  console.log(`  davon exakt         : ${agreeExact}  ${p(agreeExact, agreeN)}   <-- entscheidet ueber AP-C`);
  console.log(`  davon Oktavfehler   : ${agreeOctave}  ${p(agreeOctave, agreeN)}`);
  console.log(`  davon falsch        : ${agreeWrong}  ${p(agreeWrong, agreeN)}`);
  console.log(`uneinig               : ${disagreeN}`);
  console.log(`  davon exakt         : ${disagreeExact}  ${p(disagreeExact, disagreeN)}`);
}

if (process.env.EVAL_DETAIL) {
  console.log("\nAbweichungen:");
  for (const m of misses) console.log(" ", m);
}
