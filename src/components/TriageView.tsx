import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUUpLeft, SkipForward, X } from "@phosphor-icons/react";
import type { Track } from "../lib/nml";
import { PHASES, PHASE_COLOR, PHASE_LABEL, type Phase } from "../lib/tags";
import { activeSet, getTags, useStore } from "../lib/store/StoreProvider";
import { toast } from "../lib/toast";

/**
 * Station „Sichten“ — die Schleife, die pro Gig-Ordner dreihundert Mal läuft:
 * vorhören, Phase drücken oder aussortieren, weiter.
 *
 * Der ganze Entwurf folgt einer gemessenen Zahl: der Gig-Ordner `casa 2.0`
 * enthält 304 Dateien, das fertige Set rund 40. Bei diesem Verhältnis kostet
 * jeder Mausweg dreihundertfach — deshalb liegt hier alles auf der Tastatur,
 * und deshalb steht der Fortschritt ständig im Bild.
 */

function fmtDur(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")} h` : `${m} min`;
}

const TARGET_KEY = "reset.triage.target";
const FOLDER_KEY = "reset.triage.folder";

export function TriageView({
  tracks,
  onPreview,
}: {
  tracks: Track[];
  onPreview: (id: string) => void;
}) {
  const { state, dispatch } = useStore();
  const set = activeSet(state);

  // Ordner der Sammlung mit ihren Trackzahlen — der Ordner ist die
  // Arbeitseinheit, nicht die Gesamtbibliothek.
  const folders = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tracks) {
      const f = t.folder ?? "ohne Ordner";
      m.set(f, (m.get(f) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [tracks]);

  const [folder, setFolder] = useState<string | null>(
    () => localStorage.getItem(FOLDER_KEY) ?? null,
  );
  const [targetMin, setTargetMin] = useState<number>(() =>
    Number(localStorage.getItem(TARGET_KEY) ?? 180),
  );

  useEffect(() => {
    if (folder) localStorage.setItem(FOLDER_KEY, folder);
  }, [folder]);
  useEffect(() => {
    localStorage.setItem(TARGET_KEY, String(targetMin));
  }, [targetMin]);

  const active = folder ?? folders[0]?.[0] ?? null;

  const inFolder = useMemo(
    () => tracks.filter((t) => (t.folder ?? "ohne Ordner") === active),
    [tracks, active],
  );

  const setIds = useMemo(() => new Set(set.trackIds), [set.trackIds]);

  // Entschieden ist, was im Set liegt oder aussortiert wurde. Alles andere
  // wartet — in Dateireihenfolge, damit die Schleife vorhersehbar bleibt.
  const queue = useMemo(
    () => inFolder.filter((t) => !setIds.has(t.id) && !state.dismissed[t.id]),
    [inFolder, setIds, state.dismissed],
  );

  const current = queue[0] ?? null;
  const done = inFolder.length - queue.length;

  const setTracks = useMemo(() => {
    const byId = new Map(tracks.map((t) => [t.id, t]));
    return set.trackIds.map((id) => byId.get(id)).filter((t): t is Track => !!t);
  }, [tracks, set.trackIds]);

  const setSeconds = setTracks.reduce((s, t) => s + (t.durationS ?? 0), 0);
  const targetSeconds = targetMin * 60;

  const byPhase = useMemo(() => {
    const m: Record<Phase | "offen", Track[]> = { pre: [], mid: [], peak: [], late: [], offen: [] };
    for (const t of setTracks) {
      const p = getTags(state, t.id).phase;
      m[p ?? "offen"].push(t);
    }
    return m;
  }, [setTracks, state]);

  // --- Aktionen -------------------------------------------------------------
  const judge = useCallback(
    (phase: Phase) => {
      if (!current) return;
      dispatch({ type: "addToSet", trackId: current.id });
      dispatch({ type: "setPhase", id: current.id, phase });
      toast(`${PHASE_LABEL[phase]} · ${current.title}`);
    },
    [current, dispatch],
  );

  const drop = useCallback(() => {
    if (!current) return;
    dispatch({ type: "dismiss", id: current.id });
  }, [current, dispatch]);

  const skip = useCallback(() => {
    if (!current) return;
    // Zurückstellen statt aussortieren: ans Ende, indem wir es kurz
    // aussortieren und sofort zurückholen, wäre unsauber — stattdessen
    // merken wir uns die Zurückgestellten getrennt.
    setDeferred((d) => [...d, current.id]);
  }, [current]);

  const [deferred, setDeferred] = useState<string[]>([]);
  const orderedQueue = useMemo(() => {
    const back = new Set(deferred);
    return [...queue.filter((t) => !back.has(t.id)), ...queue.filter((t) => back.has(t.id))];
  }, [queue, deferred]);
  const shown = orderedQueue[0] ?? null;

  const preview = useCallback(() => {
    if (shown) onPreview(shown.id);
  }, [shown, onPreview]);

  // --- Tastatur -------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === " ") {
        e.preventDefault();
        preview();
      } else if (e.key >= "1" && e.key <= "4") {
        e.preventDefault();
        judgeRef.current(PHASES[Number(e.key) - 1]);
      } else if (e.key === "x" || e.key === "X" || e.key === "Backspace") {
        e.preventDefault();
        dropRef.current();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        skipRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  // Refs, damit der Tastatur-Listener nicht bei jedem Track neu gebunden wird.
  const judgeRef = useRefLatest(judge);
  const dropRef = useRefLatest(drop);
  const skipRef = useRefLatest(skip);

  // --- Darstellung ----------------------------------------------------------
  if (!folders.length) {
    return (
      <div className="view-fade mt-7 rounded-lg border border-line bg-surface p-6">
        <h2 className="mb-1 text-sm font-medium text-ink">Nichts zu sichten</h2>
        <p className="text-xs text-ink-soft">
          Lade zuerst einen Ordner unter <span className="text-ink">Laden</span> oder importiere
          eine bestehende Sammlung.
        </p>
      </div>
    );
  }

  const cur = shown;
  const tags = cur ? getTags(state, cur.id) : null;

  return (
    <div className="view-fade mt-7 grid gap-4 lg:grid-cols-[220px_1fr_270px]">
      {/* Warteschlange */}
      <section className="rounded-lg border border-line bg-surface p-4">
        <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-ink-faint">
          Ordner
        </label>
        <select
          value={active ?? ""}
          onChange={(e) => {
            setFolder(e.target.value);
            setDeferred([]);
          }}
          className="mb-3 h-8 w-full rounded-md border border-line bg-base px-2 text-[12px] text-ink-soft"
        >
          {folders.map(([f, n]) => (
            <option key={f} value={f}>
              {f} · {n}
            </option>
          ))}
        </select>

        <div className="mb-1 flex items-baseline justify-between font-mono text-[11px]">
          <span className="text-ink">{done} / {inFolder.length}</span>
          <span className="text-ink-faint">gesichtet</span>
        </div>
        <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-raise">
          <div
            className="h-full bg-accent transition-[width] duration-300"
            style={{ width: `${inFolder.length ? (done / inFolder.length) * 100 : 0}%` }}
          />
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {orderedQueue.slice(0, 60).map((t, i) => (
            <div
              key={t.id}
              className={`truncate border-t border-line py-1 text-[11px] first:border-t-0 ${
                i === 0 ? "text-ink" : "text-ink-faint"
              }`}
            >
              {t.artist} – {t.title}
            </div>
          ))}
          {orderedQueue.length > 60 && (
            <div className="border-t border-line pt-1 font-mono text-[10px] text-ink-faint">
              … {orderedQueue.length - 60} weitere
            </div>
          )}
        </div>
      </section>

      {/* Bühne */}
      <section className="flex flex-col items-center justify-center gap-4 rounded-lg border border-line bg-base p-6">
        {cur ? (
          <>
            {cur.coverPath ? (
              <img
                src={cur.coverPath}
                alt=""
                className="h-40 w-40 rounded-md object-cover"
              />
            ) : (
              <div className="flex h-40 w-40 items-center justify-center rounded-md bg-raise font-mono text-[11px] text-ink-faint">
                kein Cover
              </div>
            )}

            <div className="text-center">
              <div className="text-[15px] text-ink">{cur.title}</div>
              <div className="text-[12px] text-ink-soft">{cur.artist}</div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 font-mono text-[11px] text-ink-faint">
              {cur.keyCamelot && <span className="text-accent">{cur.keyCamelot}</span>}
              {cur.bpm != null && <span>{cur.bpm.toFixed(1)} BPM</span>}
              {(cur.keyEstimated || cur.bpmEstimated) && <span>geschätzt</span>}
              {cur.genre && <span>· {cur.genre}</span>}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {PHASES.map((p, i) => (
                <button
                  key={p}
                  onClick={() => judge(p)}
                  className="flex h-9 items-center gap-1.5 rounded-md border px-3 text-[12px] transition-colors"
                  style={{ borderColor: PHASE_COLOR[p], color: PHASE_COLOR[p] }}
                >
                  <span className="font-mono text-[10px] opacity-70">{i + 1}</span>
                  {PHASE_LABEL[p]}
                </button>
              ))}
              <button
                onClick={drop}
                className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[12px] text-ink-soft transition-colors hover:text-ink"
              >
                <X size={13} weight="regular" /> raus
              </button>
              <button
                onClick={skip}
                className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[12px] text-ink-soft transition-colors hover:text-ink"
              >
                <SkipForward size={13} weight="regular" /> später
              </button>
            </div>

            <p className="text-center font-mono text-[10px] leading-relaxed text-ink-soft">
              Leertaste hören · 1–4 Phase · X raus · → später · ⌘Z zurück
            </p>

            {tags?.phase && (
              <span className="font-mono text-[10px]" style={{ color: PHASE_COLOR[tags.phase] }}>
                bereits {PHASE_LABEL[tags.phase]}
              </span>
            )}
          </>
        ) : (
          <div className="text-center">
            <div className="mb-1 text-[15px] text-ink">Ordner durch</div>
            <p className="max-w-xs text-[12px] text-ink-soft">
              {inFolder.length} Tracks gesichtet, {setTracks.length} im Set. Weiter unter{" "}
              <span className="text-ink">Bauen</span>.
            </p>
          </div>
        )}
      </section>

      {/* Phasen-Behälter */}
      <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <span className="truncate text-[12px] text-ink">{set.name}</span>
          <span className="font-mono text-[10px] text-ink-faint">{setTracks.length}</span>
        </div>

        <div className="flex flex-col gap-2">
          {PHASES.map((p) => (
            <div
              key={p}
              className="rounded-md border border-dashed p-2"
              style={{ borderColor: PHASE_COLOR[p] }}
            >
              <div className="mb-1 flex items-baseline justify-between font-mono text-[10px]">
                <span style={{ color: PHASE_COLOR[p] }}>{PHASE_LABEL[p]}</span>
                <span className="text-ink-faint">{byPhase[p].length}</span>
              </div>
              {byPhase[p].slice(0, 3).map((t) => (
                <div key={t.id} className="truncate text-[10px] text-ink-faint">
                  {t.title}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="border-t border-line pt-2">
          <div className="mb-1 flex items-baseline justify-between font-mono text-[11px]">
            <span className="text-ink">{fmtDur(setSeconds)}</span>
            <span className="text-ink-faint">von {fmtDur(targetSeconds)}</span>
          </div>
          <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-raise">
            <div
              className="h-full bg-sig transition-[width] duration-300"
              style={{ width: `${Math.min(100, (setSeconds / targetSeconds) * 100)}%` }}
            />
          </div>
          <div className="font-mono text-[10px] text-ink-soft">
            {setSeconds >= targetSeconds
              ? `${fmtDur(setSeconds - targetSeconds)} darüber`
              : `es fehlen ${fmtDur(targetSeconds - setSeconds)}`}
          </div>
          <label className="mt-2 flex items-center gap-2 text-[10px] text-ink-faint">
            Ziel
            <input
              type="number"
              min={30}
              max={480}
              step={15}
              value={targetMin}
              onChange={(e) => setTargetMin(Number(e.target.value) || 180)}
              className="h-6 w-16 rounded border border-line bg-base px-1.5 text-[11px] text-ink-soft"
            />
            min
          </label>
        </div>

        <button
          onClick={() => dispatch({ type: "undo" })}
          className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-line text-[11px] text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowUUpLeft size={13} weight="regular" /> letzte Entscheidung zurück
        </button>
      </section>
    </div>
  );
}

/** Hält den jeweils neuesten Callback, ohne den Listener neu zu binden. */
function useRefLatest<T>(value: T) {
  const ref = useState(() => ({ current: value }))[0];
  ref.current = value;
  return ref;
}
