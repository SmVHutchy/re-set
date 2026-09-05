import type { Track } from "../nml";
import type { DryRun, SyncAdapter, SyncField, TrackState } from "./adapter";
import { toTrackState } from "./adapter";
import { diffStates } from "./state";

/**
 * Traktor-Adapter. Liest den Stand aus der geladenen Collection und beschreibt
 * Unterschiede zu einem Referenzstand.
 *
 * Was er kann, steht in `capabilities` — und was er *nicht* kann, ist genauso
 * wichtig: `comment` fehlt, weil Re:SET dort selbst schreibt (Phase · Energie ·
 * Vibes beim Export) und ein Abgleich dieses Feldes die eigenen Notizen gegen
 * sich selbst ausspielen würde.
 */
export const TRAKTOR_FIELDS: ReadonlySet<SyncField> = new Set<SyncField>([
  "bpm",
  "key",
  "rating",
  "playcount",
  "hotcues",
  "loops",
  "beatgrid",
  "playlists",
]);

export function createTraktorAdapter(tracks: Track[]): SyncAdapter {
  return {
    id: "traktor",
    label: "Traktor Pro 4",
    capabilities: TRAKTOR_FIELDS,

    read(): TrackState[] {
      return tracks.map(toTrackState);
    },

    plan(reference: TrackState[]): DryRun {
      const current = this.read();
      return {
        adapter: "traktor",
        diffs: diffStates(reference, current, TRAKTOR_FIELDS),
        // Konflikte entstehen erst, wenn Re:SET selbst in dieselben Felder
        // schreibt. Solange nur gelesen wird, gibt es keine zweite Seite —
        // eine leere Liste ist hier die ehrliche Antwort, kein Platzhalter.
        conflicts: [],
      };
    },

    async apply(): Promise<{ written: number }> {
      // Bewusst kein stilles Nichtstun: der Write-Back in eine bestehende
      // collection.nml (Backup, Dry-Run, atomares Schreiben) ist AP-C und
      // existiert noch nicht. Bis dahin ist "anwenden" nicht verfügbar.
      throw new Error(
        "Schreiben nach Traktor ist noch nicht gebaut (AP-C). Bis dahin exportierst du das Set über den NML-Export.",
      );
    },
  };
}
