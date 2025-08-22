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

/**
 * Normalize a drum object into the canonical shape used by the store.
 */
function normalizeDrum(input = {}) {
  const out = { ...input };

  out.id = out.id || makeId();
  out.type = out.type || "tom";
  out.size_in = Number(out.size_in ?? 12);
  out.lugs = Number(out.lugs ?? 6);

  if (typeof out.target === "number") {
    out.target = { batter_hz: out.target };
  } else if (typeof out.target !== "object" || out.target === null) {
    out.target = {};
  }

  const nestedRatio = (out.target && typeof out.target.reso_ratio === "number")
    ? out.target.reso_ratio
    : undefined;

  out.reso_ratio = Number(out.reso_ratio ?? nestedRatio ?? 1.06);

  out.target = {
    batter_hz: Number(
      out.target?.batter_hz ??
      (typeof input.target === "number" ? input.target : 0)
    ),
  };

  return out;
}

function normalizeKit(kit) {
  const drums = (kit?.drums ?? []).map(normalizeDrum);
  return { drums };
}

const drum = (over = {}) =>
  normalizeDrum({
    id: makeId(),
    type: over.type ?? "tom",
    size_in: over.size_in ?? 12,
    lugs: over.lugs ?? 6,
    reso_ratio: over.reso_ratio ?? 1.06,
    target: typeof over.target === "number" ? over.target : { batter_hz: over.target?.batter_hz ?? 0 },
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
  auth: { isAuthed: false, user: null },

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

  sessions: [],
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
    case "LOAD_SAVED": {
      const incoming = action.payload || {};
      const kit = normalizeKit(incoming.kit ?? state.kit);
      return {
        ...state,
        ...incoming,
        auth: incoming.auth ?? state.auth,
        kit,
        settings: { ...state.settings, ...(incoming.settings || {}) },
        sessions: incoming.sessions ?? state.sessions,
        activeDrumId: incoming.activeDrumId ?? (kit.drums[0]?.id ?? state.activeDrumId),
      };
    }

    // ---------- KIT ----------
    case "APPLY_TEMPLATE": {
      const drums = templateDrums(action.name);
      return { ...state, kit: { drums }, activeDrumId: drums[0]?.id ?? null };
    }
    case "RESET_TEMPLATE":
      return { ...state, kit: { drums: [] }, activeDrumId: null };

    case "REPLACE_KIT": {
      const drums = (action.drums ?? []).map(normalizeDrum);
      return { ...state, kit: { drums }, activeDrumId: drums[0]?.id ?? null };
    }

    case "ADD_DRUM": {
      const next = normalizeDrum({ ...action.drum, id: action.drum?.id ?? makeId() });
      const drums = [...state.kit.drums, next];
      return { ...state, kit: { drums } };
    }

    case "UPDATE_DRUM": {
      const drums = state.kit.drums.map((d) => {
        if (d.id !== action.id) return d;
        const p = action.patch || {};
        let next = { ...d, ...p };

        if ("target" in p) {
          if (typeof p.target === "number") {
            next.target = { ...d.target, batter_hz: Number(p.target) };
          } else if (p.target && typeof p.target === "object") {
            if ("batter_hz" in p.target) {
              next.target = { ...d.target, batter_hz: Number(p.target.batter_hz) };
            }
            if ("reso_ratio" in p.target && typeof p.target.reso_ratio === "number") {
              next.reso_ratio = Number(p.target.reso_ratio);
            }
          }
        }

        return normalizeDrum(next);
      });
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

export default function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // load once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) dispatch({ type: "LOAD_SAVED", payload: JSON.parse(raw) });
    } catch {}
  }, []);

  // persist important slices
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

  // ---------- THEME SYNC (this is the fix) ----------
  useEffect(() => {
    const theme = state.settings?.theme || "dark";
    const root = document.documentElement;

    // tokens.css listens to :root (dark default) + :root[data-theme="light"]
    root.setAttribute("data-theme", theme);             // sets "light" or "dark"

    // also support old class-based selectors (harmless if unused)
    root.classList.toggle("theme-dark", theme === "dark");
    root.classList.toggle("theme-light", theme === "light");

    // nice-to-have: update mobile address bar color
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#f7f8fb" : "#0b0f14");
  }, [state.settings?.theme]);

  const actions = useMemo(() => ({
    // fake auth
    loginFake: (provider, name) => dispatch({ type: "LOGIN_FAKE", provider, name }),
    logout: () => dispatch({ type: "LOGOUT" }),

    // kit
    replaceKit: (arg) => {
      const drums = Array.isArray(arg) ? arg : arg?.drums ?? [];
      dispatch({ type: "REPLACE_KIT", drums });
    },
    applyTemplate: (name) => dispatch({ type: "APPLY_TEMPLATE", name }),
    resetTemplate: () => dispatch({ type: "RESET_TEMPLATE" }),
    addDrum: (drum) => dispatch({ type: "ADD_DRUM", drum }),

    updateDrum: (idOrDrum, patch) => {
      if (typeof idOrDrum === "object" && idOrDrum?.id && !patch) {
        const { id, ...rest } = idOrDrum;
        dispatch({ type: "UPDATE_DRUM", id, patch: rest });
      } else {
        dispatch({ type: "UPDATE_DRUM", id: idOrDrum, patch });
      }
    },

    deleteDrum: (id) => dispatch({ type: "DELETE_DRUM", id }),
    removeDrum: (id) => dispatch({ type: "DELETE_DRUM", id }),
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
