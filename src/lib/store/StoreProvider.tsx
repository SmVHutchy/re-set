import { createContext, useContext, useEffect, useReducer } from "react";
import type { Phase } from "../tags";
import type { DJSet, PersistState, TrackTags } from "./types";
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
  | { type: "renameSet"; name: string }
  | { type: "newSet" }
  | { type: "selectSet"; id: string };

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
    case "renameSet":
      return withActiveSet(state, (s) => ({ ...s, name: action.name }));
    case "newSet": {
      const set = { id: newId(), name: `Set ${state.sets.length + 1}`, trackIds: [] };
      return { ...state, sets: [...state.sets, set], activeSetId: set.id };
    }
    case "selectSet":
      return { ...state, activeSetId: action.id };
    default:
      return state;
  }
}

interface StoreValue {
  state: PersistState;
  dispatch: React.Dispatch<Action>;
}

const StoreCtx = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  return <StoreCtx.Provider value={{ state, dispatch }}>{children}</StoreCtx.Provider>;
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
