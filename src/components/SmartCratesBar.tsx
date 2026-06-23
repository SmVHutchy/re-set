import { useState } from "react";
import type { Track } from "../lib/nml";
import type { CrateField, CrateRule, PersistState } from "../lib/store/types";
import { EMPTY_TAGS } from "../lib/store/types";
import { useStore } from "../lib/store/StoreProvider";
import { newId } from "../lib/store/storage";
import { crateMatches } from "../lib/smartcrate";
import { PHASES } from "../lib/tags";
import { Plus, X, Stack, Trash } from "@phosphor-icons/react";

const FIELD_LABEL: Record<CrateField, string> = {
  phase: "Phase",
  energy: "Energie",
  bpm: "BPM",
  key: "Key",
  genre: "Genre",
  vibe: "Vibe",
  text: "Text",
};

function defaultRule(field: CrateField): CrateRule {
  switch (field) {
    case "phase":
      return { field, op: "is", value: "peak" };
    case "energy":
      return { field, op: "gte", value: "7" };
    case "bpm":
      return { field, op: "gte", value: "126" };
    case "key":
      return { field, op: "is", value: "8A" };
    default:
      return { field, op: field === "vibe" ? "has" : "contains", value: "" };
  }
}

interface Props {
  tracks: Track[];
  state: PersistState;
  activeCrateId: string | null;
  onPick: (id: string | null) => void;
}

export function SmartCratesBar({ tracks, state, activeCrateId, onPick }: Props) {
  const { dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rules, setRules] = useState<CrateRule[]>([defaultRule("phase")]);

  const countFor = (crateId: string) => {
    const crate = state.smartCrates.find((c) => c.id === crateId);
    if (!crate) return 0;
    return tracks.filter((t) => crateMatches(t, state.tags[t.id] ?? EMPTY_TAGS, crate)).length;
  };

  const save = () => {
    if (!name.trim() || rules.length === 0) return;
    dispatch({ type: "addSmartCrate", crate: { id: newId(), name: name.trim(), rules } });
    setName("");
    setRules([defaultRule("phase")]);
    setOpen(false);
  };

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Stack size={14} weight="regular" className="text-ink-faint" />
        {state.smartCrates.map((c) => {
          const active = c.id === activeCrateId;
          return (
            <span
              key={c.id}
              className="flex items-center gap-1 rounded-md border px-2 py-1 text-[12px]"
              style={{
                borderColor: active ? "var(--color-accent)" : "var(--color-line)",
                background: active ? "var(--color-accent-soft)" : "transparent",
                color: active ? "var(--color-accent)" : "var(--color-ink-soft)",
              }}
            >
              <button onClick={() => onPick(active ? null : c.id)} className="font-medium">
                {c.name} <span className="font-mono text-ink-faint">{countFor(c.id)}</span>
              </button>
              <button
                aria-label="Crate löschen"
                onClick={() => {
                  if (active) onPick(null);
                  dispatch({ type: "deleteSmartCrate", id: c.id });
                }}
                className="text-ink-faint hover:text-accent"
              >
                <Trash size={11} weight="bold" />
              </button>
            </span>
          );
        })}
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 rounded-md border border-dashed border-line-strong px-2 py-1 text-[12px] text-ink-soft hover:text-ink"
        >
          <Plus size={12} weight="bold" /> Smart-Crate
        </button>
      </div>

      {open && (
        <div className="mt-2 rounded-lg border border-line bg-surface p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Crate-Name (z. B. Peak Driving)"
            className="mb-2 h-8 w-full rounded-md border border-line bg-base px-2 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-line-strong"
          />
          <div className="flex flex-col gap-1.5">
            {rules.map((r, i) => (
              <RuleRow
                key={i}
                rule={r}
                onChange={(nr) => setRules((rs) => rs.map((x, j) => (j === i ? nr : x)))}
                onRemove={() => setRules((rs) => rs.filter((_, j) => j !== i))}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => setRules((rs) => [...rs, defaultRule("energy")])}
              className="rounded-md border border-line px-2 py-1 text-[12px] text-ink-soft hover:text-ink"
            >
              + Regel
            </button>
            <button
              onClick={save}
              className="ml-auto rounded-md border px-3 py-1 text-[12px] font-medium"
              style={{ borderColor: "var(--color-accent)", background: "var(--color-accent)", color: "#3b1426" }}
            >
              Speichern
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md border border-line px-2 py-1 text-[12px] text-ink-soft hover:text-ink"
            >
              Abbrechen
            </button>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">Alle Regeln müssen passen (UND).</p>
        </div>
      )}
    </div>
  );
}

function RuleRow({
  rule,
  onChange,
  onRemove,
}: {
  rule: CrateRule;
  onChange: (r: CrateRule) => void;
  onRemove: () => void;
}) {
  const numeric = rule.field === "energy" || rule.field === "bpm";
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={rule.field}
        onChange={(e) => onChange(defaultRule(e.target.value as CrateField))}
        className="h-8 rounded-md border border-line bg-base px-1.5 text-[12px] text-ink outline-none focus:border-line-strong"
      >
        {(Object.keys(FIELD_LABEL) as CrateField[]).map((f) => (
          <option key={f} value={f}>
            {FIELD_LABEL[f]}
          </option>
        ))}
      </select>

      {numeric && (
        <select
          value={rule.op}
          onChange={(e) => onChange({ ...rule, op: e.target.value as CrateRule["op"] })}
          className="h-8 rounded-md border border-line bg-base px-1.5 text-[12px] text-ink outline-none focus:border-line-strong"
        >
          <option value="gte">≥</option>
          <option value="lte">≤</option>
        </select>
      )}

      {rule.field === "phase" ? (
        <select
          value={rule.value}
          onChange={(e) => onChange({ ...rule, value: e.target.value })}
          className="h-8 flex-1 rounded-md border border-line bg-base px-1.5 text-[12px] text-ink outline-none focus:border-line-strong"
        >
          {PHASES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={rule.value}
          onChange={(e) => onChange({ ...rule, value: e.target.value })}
          inputMode={numeric ? "numeric" : "text"}
          placeholder={numeric ? "Wert" : "…"}
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-base px-2 text-[12px] text-ink outline-none placeholder:text-ink-faint focus:border-line-strong"
        />
      )}

      <button aria-label="Regel entfernen" onClick={onRemove} className="text-ink-faint hover:text-accent">
        <X size={13} weight="bold" />
      </button>
    </div>
  );
}
