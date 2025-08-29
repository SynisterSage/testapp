// src/store/AppProvider.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";

import {
  listenToAuth,
  loginWithEmail,
  loginWithGoogle,
  registerWithEmail,
  logoutFirebase,
} from "../lib/auth";

import {
  loadUserState,
  saveUserState,
  patchUserState,
} from "../lib/db";

import {
  debounceCloudSave,
  persistLocal,
  readLocal,
} from "../lib/persistence";

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

  const nestedRatio =
    out.target && typeof out.target.reso_ratio === "number"
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
    target:
      typeof over.target === "number"
        ? over.target
        : { batter_hz: over.target?.batter_hz ?? 0 },
  });

const templateDrums = (name) => {
  if (name === "3")
    return [
      drum({ type: "kick", size_in: 22, lugs: 8, target: 60 }),
      drum({ type: "snare", size_in: 14, lugs: 10, target: 260 }),
      drum({ type: "tom", size_in: 16, lugs: 8, target: 85 }),
    ];
  if (name === "4")
    return [
      drum({ type: "kick", size_in: 22, lugs: 8, target: 60 }),
      drum({ type: "snare", size_in: 14, lugs: 10, target: 260 }),
      drum({ type: "tom", size_in: 12, lugs: 6, target: 180 }),
      drum({ type: "tom", size_in: 16, lugs: 8, target: 85 }),
    ];
  // 5-piece default
  return [
    drum({ type: "kick", size_in: 22, lugs: 8, target: 60 }),
    drum({ type: "snare", size_in: 14, lugs: 10, target: 260 }),
    drum({ type: "tom", size_in: 10, lugs: 6, target: 220 }),
    drum({ type: "tom", size_in: 12, lugs: 6, target: 180 }),
    drum({ type: "tom", size_in: 16, lugs: 8, target: 85 }),
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

function kitCount(kit) {
  const drums = kit?.drums;
  return Array.isArray(drums) ? drums.length : 0;
}

// ⚠️ local-first: if local has drums, use it; else use remote; else empty
function preferLocalKit(remoteKit, localKit) {
  const lc = kitCount(localKit);
  const rc = kitCount(remoteKit);
  if (lc > 0) return normalizeKit(localKit);
  if (rc > 0) return normalizeKit(remoteKit);
  return { drums: [] };
}

function reducer(state, action) {
  switch (action.type) {
    // ---------- AUTH ----------
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
        activeDrumId:
          incoming.activeDrumId ?? kit.drums[0]?.id ?? state.activeDrumId,
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
      const next = normalizeDrum({
        ...action.drum,
        id: action.drum?.id ?? makeId(),
      });
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
              next.target = {
                ...d.target,
                batter_hz: Number(p.target.batter_hz),
              };
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
      const drums = state.kit.drums.filter((d) => d.id !== action.id);
      return {
        ...state,
        kit: { drums },
        activeDrumId: drums[0]?.id ?? null,
      };
    }

    case "SET_ACTIVE_DRUM":
      return { ...state, activeDrumId: action.id };

    // ---------- SETTINGS ----------
    case "UPDATE_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.patch } };

    // ---------- SESSIONS ----------
    case "ADD_SESSION":
      return {
        ...state,
        sessions: [action.session, ...state.sessions].slice(0, 20),
      };

    // ---------- CLEAR ----------
    case "CLEAR_ALL":
      return JSON.parse(JSON.stringify(initialState));

    default:
      return state;
  }
}

// ----- Optional pre-seed from localStorage (so theme/kit render before first paint) -----
function lazyInit(init) {
  let cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(LS_KEY) || "null");
  } catch {}
  if (!cached) return init;
  return {
    ...init,
    ...cached,
    kit: normalizeKit(cached.kit ?? init.kit),
    settings: { ...init.settings, ...(cached.settings || {}) },
    activeDrumId: cached.activeDrumId ?? init.activeDrumId,
  };
}

export default function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState, lazyInit);

  // prevents the first render from clobbering saved data
  const hydratedRef = useRef(false);

  // If you prefer NOT to pre-seed above, you can still keep this local hydration:
  useEffect(() => {
    const cached = readLocal(LS_KEY);
    if (cached) {
      dispatch({ type: "LOAD_SAVED", payload: cached });
    }
    hydratedRef.current = true; // allow persisting after we tried local
  }, []);

  // Auth + remote merge (LOCAL wins if it has drums / settings)
  useEffect(() => {
    const unsub = listenToAuth(async (user) => {
      if (!user) {
        dispatch({ type: "LOGOUT" });
        return;
      }

      const authPayload = {
        isAuthed: true,
        user: {
          id: user.uid,
          name:
            user.displayName ||
            (user.email ? user.email.split("@")[0] : "User"),
          email: user.email || null,
          provider: user.providerData?.[0]?.providerId || "password",
        },
      };

      // Unlock routes immediately
      dispatch({ type: "LOAD_SAVED", payload: { auth: authPayload } });

      const local = readLocal(LS_KEY) || {};

      try {
        const remote = await loadUserState(user.uid);

        if (remote) {
          const mergedKit = preferLocalKit(remote.kit, local.kit) ?? initialState.kit;

          if (kitCount(remote.kit) === 0 && kitCount(local.kit) > 0) {
            // seed remote from local (fire and forget)
            patchUserState(user.uid, { kit: mergedKit }).catch(() => {});
          }

          const merged = {
            kit: mergedKit,
            sessions: Array.isArray(remote.sessions)
              ? remote.sessions
              : (local.sessions ?? []),
            activeDrumId:
              remote.activeDrumId ?? local.activeDrumId ?? null,
            // settings precedence: initial < remote < local
            settings: {
              ...initialState.settings,
              ...(remote.settings || {}),
              ...(local.settings || {}),
            },
          };

          dispatch({
            type: "LOAD_SAVED",
            payload: { ...merged, auth: authPayload },
          });
        } else {
          // No remote yet → seed from local (or defaults)
          const seed = {
            kit: local.kit ?? initialState.kit,
            settings: local.settings ?? initialState.settings,
            sessions: local.sessions ?? [],
            activeDrumId: local.activeDrumId ?? null,
          };
          await saveUserState(user.uid, seed);
          dispatch({
            type: "LOAD_SAVED",
            payload: { ...seed, auth: authPayload },
          });
        }
      } catch (e) {
        console.error("Firestore hydrate error:", e);
        dispatch({
          type: "LOAD_SAVED",
          payload: {
            kit: local.kit ?? initialState.kit,
            settings: local.settings ?? initialState.settings,
            sessions: local.sessions ?? [],
            activeDrumId: local.activeDrumId ?? null,
            auth: authPayload,
          },
        });
      }

      // after auth hydration completes we can safely persist
      hydratedRef.current = true;
    });

    return () => unsub();
  }, []);

  // Persist to local + cloud (debounced). Skip until hydrated.
  useEffect(() => {
    if (!hydratedRef.current) return;

    const payload = {
      auth: state.auth,
      kit: state.kit,
      settings: state.settings,
      sessions: state.sessions,
      activeDrumId: state.activeDrumId,
    };
    persistLocal(LS_KEY, payload);

    const uid = state.auth?.user?.id;
    if (uid) {
      debounceCloudSave(uid, () => {
        const { kit, settings, sessions, activeDrumId } = state;
        patchUserState(uid, { kit, settings, sessions, activeDrumId }).catch(
          () => {}
        );
      });
    }
  }, [
    state.auth,
    state.kit,
    state.settings,
    state.sessions,
    state.activeDrumId,
  ]);

  // Theme sync
  useEffect(() => {
    const theme = state.settings?.theme || "dark";
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.classList.toggle("theme-dark", theme === "dark");
    root.classList.toggle("theme-light", theme === "light");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#f7f8fb" : "#0b0f14");
  }, [state.settings?.theme]);

  const actions = useMemo(
    () => ({
      // AUTH
      loginEmail: (email, pwd) => loginWithEmail(email, pwd),
      registerEmail: (email, pwd, name) => registerWithEmail(email, pwd, name),
      loginGoogle: () => loginWithGoogle(),
      logout: () => logoutFirebase(),

      // KIT / SETTINGS / SESSIONS
      replaceKit: (arg) => {
        const drums = Array.isArray(arg) ? arg : arg?.drums ?? [];
        return dispatch({ type: "REPLACE_KIT", drums });
      },
      applyTemplate: (name) => dispatch({ type: "APPLY_TEMPLATE", name }),
      resetTemplate: () => dispatch({ type: "RESET_TEMPLATE" }),
      addDrum: (drumObj) => dispatch({ type: "ADD_DRUM", drum: drumObj }),

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
      updateSettings: (patch) => dispatch({ type: "UPDATE_SETTINGS", patch }),
      addSession: (session) => dispatch({ type: "ADD_SESSION", session }),

      clearAll: () => {
        try {
          localStorage.removeItem(LS_KEY);
        } catch {}
        dispatch({ type: "CLEAR_ALL" });
      },
    }),
    [state]
  );

  return <Ctx.Provider value={{ state, actions }}>{children}</Ctx.Provider>;
}
