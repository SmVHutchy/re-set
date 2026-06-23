import { createContext, useContext, useEffect, useReducer } from "react";
import type { Phase } from "../tags";
import type { DJSet, PersistState, TrackTags, SmartCrate } from "./types";
import { EMPTY_TAGS } from "./types";
import { loadState, newId, saveState } from "./storage";

type Action =
  | { type: "setEnergy"; id: string; energy: number | null }
  | { type: "setPhase"; id: string; phase: Phase | null }
  | { type: "addVibe"; id: string; vibe: string }
  | { type: "removeVibe"; id: string; vibe: string }
  | { type: "addToSet"; trackId: string }
  | { type: "removeFromSet"; index: number }
  | { type: "moveInSet"; index: number; dir: -1 | 1 }
  | { type: "reorderInSet"; from: number; to: number }
  | { type: "renameSet"; name: string }
  | { type: "newSet" }
  | { type: "selectSet"; id: string }
  | { type: "deleteSet" }
  | { type: "duplicateSet" }
  | { type: "moveCard"; trackId: string; x: number; y: number }
  | { type: "clearLayout" }
  | { type: "batchSetPhase"; ids: string[]; phase: Phase | null }
  | { type: "batchSetEnergy"; ids: string[]; energy: number | null }
  | { type: "batchAddVibe"; ids: string[]; vibe: string }
  | { type: "batchAddToSet"; ids: string[] }
  | { type: "replaceSetOrder"; ids: string[] }
  | { type: "addSmartCrate"; crate: SmartCrate }
  | { type: "deleteSmartCrate"; id: string }
  | { type: "undo" }
  | { type: "redo" };

function patchTags(
  state: PersistState,
  id: string,
  patch: Partial<TrackTags>,
): PersistState {
  const prev = state.tags[id] ?? EMPTY_TAGS;
  return { ...state, tags: { ...state.tags, [id]: { ...prev, ...patch } } };
}

function withActiveSet(
  state: PersistState,
  fn: (set: DJSet) => DJSet,
): PersistState {
  return {
    ...state,
    sets: state.sets.map((s) => (s.id === state.activeSetId ? fn(s) : s)),
  };
}

function reducer(state: PersistState, action: Action): PersistState {
  switch (action.type) {
    case "setEnergy":
      return patchTags(state, action.id, { energy: action.energy });
    case "setPhase":
      return patchTags(state, action.id, { phase: action.phase });
    case "addVibe": {
      const prev = state.tags[action.id] ?? EMPTY_TAGS;
      const v = action.vibe.trim().toLowerCase();
      if (!v || prev.vibe.includes(v)) return state;
      return patchTags(state, action.id, { vibe: [...prev.vibe, v] });
    }
    case "removeVibe": {
      const prev = state.tags[action.id] ?? EMPTY_TAGS;
      return patchTags(state, action.id, {
        vibe: prev.vibe.filter((x) => x !== action.vibe),
      });
    }
    case "addToSet":
      return withActiveSet(state, (s) =>
        s.trackIds.includes(action.trackId)
          ? s
          : { ...s, trackIds: [...s.trackIds, action.trackId] },
      );
    case "removeFromSet":
      return withActiveSet(state, (s) => ({
        ...s,
        trackIds: s.trackIds.filter((_, i) => i !== action.index),
      }));
    case "moveInSet":
      return withActiveSet(state, (s) => {
        const j = action.index + action.dir;
        if (j < 0 || j >= s.trackIds.length) return s;
        const ids = s.trackIds.slice();
        [ids[action.index], ids[j]] = [ids[j], ids[action.index]];
        return { ...s, trackIds: ids };
      });
    case "reorderInSet":
      return withActiveSet(state, (s) => {
        const ids = [...s.trackIds];
        const [moved] = ids.splice(action.from, 1);
        if (moved === undefined) return s;
        ids.splice(action.to, 0, moved);
        return { ...s, trackIds: ids };
      });
    case "renameSet":
      return withActiveSet(state, (s) => ({ ...s, name: action.name }));
    case "newSet": {
      const set = { id: newId(), name: `Set ${state.sets.length + 1}`, trackIds: [] };
      return { ...state, sets: [...state.sets, set], activeSetId: set.id };
    }
    case "selectSet":
      return { ...state, activeSetId: action.id };
    case "deleteSet": {
      const rest = state.sets.filter((s) => s.id !== state.activeSetId);
      const sets = rest.length > 0 ? rest : [{ id: newId(), name: "Set 1", trackIds: [] }];
      return { ...state, sets, activeSetId: sets[0].id };
    }
    case "duplicateSet": {
      const src = state.sets.find((s) => s.id === state.activeSetId);
      if (!src) return state;
      const copy: DJSet = {
        id: newId(),
        name: `${src.name} Kopie`,
        trackIds: [...src.trackIds],
        positions: src.positions ? { ...src.positions } : undefined,
      };
      const i = state.sets.findIndex((s) => s.id === src.id);
      const sets = [...state.sets];
      sets.splice(i + 1, 0, copy);
      return { ...state, sets, activeSetId: copy.id };
    }
    case "moveCard":
      return withActiveSet(state, (s) => ({
        ...s,
        positions: { ...(s.positions ?? {}), [action.trackId]: { x: action.x, y: action.y } },
      }));
    case "clearLayout":
      return withActiveSet(state, (s) => ({ ...s, positions: {} }));
    case "batchSetPhase": {
      const tags = { ...state.tags };
      for (const id of action.ids) tags[id] = { ...(tags[id] ?? EMPTY_TAGS), phase: action.phase };
      return { ...state, tags };
    }
    case "batchSetEnergy": {
      const tags = { ...state.tags };
      for (const id of action.ids) tags[id] = { ...(tags[id] ?? EMPTY_TAGS), energy: action.energy };
      return { ...state, tags };
    }
    case "batchAddVibe": {
      const v = action.vibe.trim().toLowerCase();
      if (!v) return state;
      const tags = { ...state.tags };
      for (const id of action.ids) {
        const prev = tags[id] ?? EMPTY_TAGS;
        if (!prev.vibe.includes(v)) tags[id] = { ...prev, vibe: [...prev.vibe, v] };
      }
      return { ...state, tags };
    }
    case "batchAddToSet":
      return withActiveSet(state, (s) => {
        const add = action.ids.filter((id) => !s.trackIds.includes(id));
        return add.length ? { ...s, trackIds: [...s.trackIds, ...add] } : s;
      });
    case "replaceSetOrder":
      return withActiveSet(state, (s) => {
        const valid = action.ids.filter((id) => s.trackIds.includes(id));
        return valid.length === s.trackIds.length ? { ...s, trackIds: valid } : s;
      });
    case "addSmartCrate":
      return { ...state, smartCrates: [...state.smartCrates, action.crate] };
    case "deleteSmartCrate":
      return { ...state, smartCrates: state.smartCrates.filter((c) => c.id !== action.id) };
    default:
      return state;
  }
}

interface History {
  past: PersistState[];
  present: PersistState;
  future: PersistState[];
}

const HISTORY_LIMIT = 60;

function historyReducer(h: History, action: Action): History {
  if (action.type === "undo") {
    if (h.past.length === 0) return h;
    const prev = h.past[h.past.length - 1];
    return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
  }
  if (action.type === "redo") {
    if (h.future.length === 0) return h;
    const next = h.future[0];
    return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
  }
  const present = reducer(h.present, action);
  if (present === h.present) return h; // keine Änderung → nicht in die History
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present, future: [] };
}

interface StoreValue {
  state: PersistState;
  dispatch: React.Dispatch<Action>;
  canUndo: boolean;
  canRedo: boolean;
}

const StoreCtx = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [history, dispatch] = useReducer(historyReducer, undefined, () => ({
    past: [],
    present: loadState(),
    future: [],
  }));

  useEffect(() => {
    saveState(history.present);
  }, [history.present]);

  return (
    <StoreCtx.Provider
      value={{
        state: history.present,
        dispatch,
        canUndo: history.past.length > 0,
        canRedo: history.future.length > 0,
      }}
    >
      {children}
    </StoreCtx.Provider>
  );
}

export function useStore(): StoreValue {
  const v = useContext(StoreCtx);
  if (!v) throw new Error("useStore muss innerhalb von <StoreProvider> stehen");
  return v;
}

export function getTags(state: PersistState, id: string): TrackTags {
  return state.tags[id] ?? EMPTY_TAGS;
}

export function activeSet(state: PersistState): DJSet {
  return state.sets.find((s) => s.id === state.activeSetId) ?? state.sets[0];
}
