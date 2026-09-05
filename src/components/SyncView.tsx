import { useMemo, useState } from "react";
import { ArrowsClockwise, BookmarkSimple, Warning } from "@phosphor-icons/react";
import type { Track } from "../lib/nml";
import { FIELD_LABEL, type DryRun, type TrackDiff } from "../lib/sync/adapter";
import { createTraktorAdapter } from "../lib/sync/traktor";
import { clearSnapshot, loadSnapshot, saveSnapshot } from "../lib/sync/state";
import { toast } from "../lib/toast";

const STATUS_LABEL: Record<TrackDiff["status"], string> = {
  added: "neu",
  removed: "entfernt",
  changed: "geändert",
};

function DiffRow({ d }: { d: TrackDiff }) {
  return (
    <div className="border-t border-line py-2 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[12px] text-ink">
          {d.artist} – {d.title}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-ink-faint">{STATUS_LABEL[d.status]}</span>
      </div>
      {d.changes.map((c) => (
        <div key={c.field} className="mt-0.5 flex gap-2 font-mono text-[10px] text-ink-faint">
          <span className="w-24 shrink-0 text-ink-soft">{FIELD_LABEL[c.field]}</span>
          <span className="truncate">{c.before}</span>
          <span className="shrink-0 text-ink-soft">→</span>
          <span className="truncate text-ink">{c.after}</span>
        </div>
      ))}
    </div>
  );
}

export function SyncView({ tracks }: { tracks: Track[] }) {
  const adapter = useMemo(() => createTraktorAdapter(tracks), [tracks]);
  const [snapshotAt, setSnapshotAt] = useState<number | null>(
    () => loadSnapshot(adapter.id)?.takenAt ?? null,
  );
  const [run, setRun] = useState<DryRun | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const compare = () => {
    const snap = loadSnapshot(adapter.id);
    if (!snap) {
      toast("Noch kein Stand gemerkt");
      return;
    }
    setRun(adapter.plan(snap.tracks));
  };

  const remember = () => {
    const now = Date.now();
    saveSnapshot({ adapter: adapter.id, takenAt: now, tracks: adapter.read() });
    setSnapshotAt(now);
    setRun(null);
    toast("Stand gemerkt");
  };

  const forget = () => {
    clearSnapshot(adapter.id);
    setSnapshotAt(null);
    setRun(null);
  };

  const tryApply = async () => {
    if (!run) return;
    try {
      await adapter.apply(run);
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : String(err));
    }
  };

  const caps = [...adapter.capabilities];

  return (
    <div className="view-fade mt-7 flex flex-col gap-6 lg:max-w-2xl">
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-1 text-sm font-medium text-ink">Abgleich mit {adapter.label}</h2>
        <p className="mb-4 text-xs leading-relaxed text-ink-soft">
          Merke dir den aktuellen Stand deiner Collection, arbeite in Traktor weiter, und vergleiche
          danach: Re:SET zeigt, welche Tracks dazugekommen sind und wo sich Hotcues, Beatgrid, BPM,
          Tonart oder Bewertung geändert haben.
        </p>

        <div className="mb-4 flex flex-wrap gap-1.5">
          {caps.map((c) => (
            <span
              key={c}
              className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-faint"
            >
              {FIELD_LABEL[c]}
            </span>
          ))}
        </div>

        <div className="mb-4 font-mono text-[11px] text-ink-faint">
          {snapshotAt
            ? `Gemerkter Stand: ${new Date(snapshotAt).toLocaleString("de-DE")} · ${tracks.length} Tracks geladen`
            : `Kein Stand gemerkt · ${tracks.length} Tracks geladen`}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={remember}
            className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-[12px] font-medium text-on-accent"
          >
            <BookmarkSimple size={14} weight="regular" /> Stand merken
          </button>
          <button
            onClick={compare}
            disabled={!snapshotAt}
            className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[12px] text-ink-soft hover:text-ink transition-colors disabled:opacity-40"
          >
            <ArrowsClockwise size={14} weight="regular" /> Vergleichen
          </button>
          {snapshotAt && (
            <button
              onClick={forget}
              className="h-9 px-2 text-[11px] text-ink-faint hover:text-ink transition-colors"
            >
              verwerfen
            </button>
          )}
        </div>
      </section>

      {run && (
        <section className="rounded-lg border border-line bg-surface p-5">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[12px] font-medium text-ink">
              {run.diffs.length === 0 ? "Keine Unterschiede" : `${run.diffs.length} Unterschiede`}
            </span>
            <span className="font-mono text-[10px] text-ink-faint">
              {run.conflicts.length} Konflikte
            </span>
          </div>

          {run.diffs.length === 0 ? (
            <p className="text-[11px] text-ink-soft">
              Die Collection entspricht dem gemerkten Stand.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {run.diffs.slice(0, 200).map((d) => (
                <DiffRow key={d.id + d.status} d={d} />
              ))}
              {run.diffs.length > 200 && (
                <p className="border-t border-line pt-2 font-mono text-[10px] text-ink-faint">
                  … {run.diffs.length - 200} weitere
                </p>
              )}
            </div>
          )}

          {run.diffs.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <button
                onClick={tryApply}
                className="flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-[12px] text-ink-soft hover:text-ink transition-colors"
              >
                <Warning size={14} weight="regular" /> Nach Traktor schreiben
              </button>
              {applyError && (
                <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">{applyError}</p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
