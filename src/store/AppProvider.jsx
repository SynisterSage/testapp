import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";

const Ctx = createContext(null);
export function useAppStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppStore must be used within <AppProvider>");
  return v;
}

// -------- helpers --------
const makeId = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : "id-" + Math.random().toString(36).slice(2) + Date.now();

const drum = (over = {}) => ({
  id: makeId(),
  type: over.type ?? "tom",
  size_in: over.size_in ?? 12,
  lugs: over.lugs ?? 6,
  reso_ratio: over.reso_ratio ?? 1.06,
  target: { batter_hz: over.target ?? 0 },
});

const templateDrums = (name) => {
  if (name === "3") return [
    drum({ type: "kick",  size_in: 22, lugs: 8,  target: 60 }),
    drum({ type: "snare", size_in: 14, lugs: 10, target: 260 }),
    drum({ type: "tom",   size_in: 16, lugs: 8,  target: 85 }),
  ];
  if (name === "4") return [
    drum({ type: "kick",  size_in: 22, lugs: 8,  target: 60 }),
    drum({ type: "snare", size_in: 14, lugs: 10, target: 260 }),
    drum({ type: "tom",   size_in: 12, lugs: 6,  target: 180 }),
    drum({ type: "tom",   size_in: 16, lugs: 8,  target: 85 }),
  ];
  // 5-piece default
  return [
    drum({ type: "kick",  size_in: 22, lugs: 8,  target: 60 }),
    drum({ type: "snare", size_in: 14, lugs: 10, target: 260 }),
    drum({ type: "tom",   size_in: 10, lugs: 6,  target: 220 }),
    drum({ type: "tom",   size_in: 12, lugs: 6,  target: 180 }),
    drum({ type: "tom",   size_in: 16, lugs: 8,  target: 85 }),
  ];
};

// -------- state --------
const LS_KEY = "overtone:state";

const initialState = {
  // FAKE AUTH (simple + persisted)
  auth: { isAuthed: false, user: null }, // user: { id, name, provider }

  kit: { drums: [] },
  activeDrumId: null,

  settings: {
    lockCents: 5,
    holdMs: 300,
    rmsThreshold: 0.02,
    bandpassLowHz: 60,
    bandpassHighHz: 400,
    autoAdvanceOnLock: true,
    theme: "dark",
  },

  sessions: [], // recent tuning sessions
};

function reducer(state, action) {
  switch (action.type) {
    // ---------- AUTH ----------
    case "LOGIN_FAKE": {
      const user = {
        id: makeId(),
        name: action.name || (action.provider === "google" ? "Google User" : "Guest"),
        provider: action.provider || "guest",
      };
      return { ...state, auth: { isAuthed: true, user } };
    }
    case "LOGOUT":
      return { ...state, auth: { isAuthed: false, user: null } };

    // ---------- PERSIST ----------
    case "LOAD_SAVED":
      // be defensive in case old localStorage shape exists
      return {
        ...state,
        ...(action.payload || {}),
        auth: action.payload?.auth ?? state.auth,
        kit: action.payload?.kit ?? state.kit,
        settings: { ...state.settings, ...(action.payload?.settings || {}) },
        sessions: action.payload?.sessions ?? state.sessions,
        activeDrumId: action.payload?.activeDrumId ?? state.activeDrumId,
      };

    // ---------- KIT ----------
    case "APPLY_TEMPLATE": {
      const drums = templateDrums(action.name);
      return { ...state, kit: { drums }, activeDrumId: drums[0]?.id ?? null };
    }
    case "RESET_TEMPLATE":
      return { ...state, kit: { drums: [] }, activeDrumId: null };

    case "ADD_DRUM": {
      const drums = [
        ...state.kit.drums,
        { ...action.drum, id: makeId(), target: { batter_hz: action.drum.target ?? 0 } },
      ];
      return { ...state, kit: { drums } };
    }
    case "UPDATE_DRUM": {
      const drums = state.kit.drums.map(d =>
        d.id === action.id
          ? { ...d, ...action.patch, target: { batter_hz: action.patch.target ?? d.target?.batter_hz ?? 0 } }
          : d
      );
      return { ...state, kit: { drums } };
    }
    case "DELETE_DRUM": {
      const drums = state.kit.drums.filter(d => d.id !== action.id);
      return { ...state, kit: { drums }, activeDrumId: drums[0]?.id ?? null };
    }
    case "SET_ACTIVE_DRUM":
      return { ...state, activeDrumId: action.id };

    // ---------- SETTINGS ----------
    case "UPDATE_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.patch } };

    // ---------- SESSIONS ----------
    case "ADD_SESSION":
      return { ...state, sessions: [action.session, ...state.sessions].slice(0, 20) };

    // ---------- CLEAR ----------
    case "CLEAR_ALL":
      return JSON.parse(JSON.stringify(initialState));

    default:
      return state;
  }
}

// -------- provider --------
export default function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // load once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        dispatch({ type: "LOAD_SAVED", payload: parsed });
      }
    } catch {}
  }, []);

  // persist when key slices change (avoid huge writes)
  useEffect(() => {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({
          auth: state.auth,
          kit: state.kit,
          settings: state.settings,
          sessions: state.sessions,
          activeDrumId: state.activeDrumId,
        })
      );
    } catch {}
  }, [state.auth, state.kit, state.settings, state.sessions, state.activeDrumId]);

  const actions = useMemo(() => ({
    // fake auth
    loginFake: (provider, name) => dispatch({ type: "LOGIN_FAKE", provider, name }),
    logout: () => dispatch({ type: "LOGOUT" }),

    // kit
    applyTemplate: (name) => dispatch({ type: "APPLY_TEMPLATE", name }),
    resetTemplate: () => dispatch({ type: "RESET_TEMPLATE" }),
    addDrum: (drum) => dispatch({ type: "ADD_DRUM", drum }),
    updateDrum: (id, patch) => dispatch({ type: "UPDATE_DRUM", id, patch }),
    deleteDrum: (id) => dispatch({ type: "DELETE_DRUM", id }),
    setActiveDrumId: (id) => dispatch({ type: "SET_ACTIVE_DRUM", id }),

    // settings
    updateSettings: (patch) => dispatch({ type: "UPDATE_SETTINGS", patch }),

    // sessions
    addSession: (session) => dispatch({ type: "ADD_SESSION", session }),

    // utility
    clearAll: () => {
      try { localStorage.removeItem(LS_KEY); } catch {}
      dispatch({ type: "CLEAR_ALL" });
    },
  }), []);

  return <Ctx.Provider value={{ state, actions }}>{children}</Ctx.Provider>;
}
