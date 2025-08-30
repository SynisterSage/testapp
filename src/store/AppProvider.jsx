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
  loadUserStateWithFallback,
  patchUserState,
  saveKit,
  loadDeviceState,
  saveDeviceState,
} from "../lib/db";

import {
  debounceCloudSave,
  persistLocal,
  readLocal,
  ensureDeviceId,
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
const LS_KEY = "overtone:state"; // shared cache key (per device/browser)

const initialState = {
  auth: { isAuthed: false, user: null },

  kit: { drums: [] },        // SHARED across devices
  activeDrumId: null,

  settings: {                // SHARED across devices
    lockCents: 5,
    holdMs: 300,
    rmsThreshold: 0.02,
    bandpassLowHz: 60,
    bandpassHighHz: 400,
    autoAdvanceOnLock: true,
    theme: "dark",
  },

  sessions: [],              // DEVICE-LOCAL by default
};

function kitCount(kit) {
  const drums = kit?.drums;
  return Array.isArray(drums) ? drums.length : 0;
}

function preferLocalKit(remoteKit, localKit) {
  const lc = kitCount(localKit);
  const rc = kitCount(remoteKit);
  if (rc > 0) return normalizeKit(remoteKit);  // prefer cloud when it exists
  if (lc > 0) return normalizeKit(localKit);
  return { drums: [] };
}

function reducer(state, action) {
  switch (action.type) {
    case "LOGOUT":
      return { ...state, auth: { isAuthed: false, user: null } };

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

    // KIT
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

    // SETTINGS (shared)
    case "UPDATE_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.patch } };

    // SESSIONS (device-local)
    case "ADD_SESSION":
      return {
        ...state,
        sessions: [action.session, ...state.sessions].slice(0, 20),
      };

    case "CLEAR_ALL":
      return JSON.parse(JSON.stringify(initialState));

    default:
      return state;
  }
}

// Seed from localStorage so UI paints quickly
function lazyInit(init) {
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch {}
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
  const hydratedRef = useRef(false);

  // Local hydration
  useEffect(() => {
    const cached = readLocal(LS_KEY);
    if (cached) dispatch({ type: "LOAD_SAVED", payload: cached });
    hydratedRef.current = true;
  }, []);

  // Auth + Remote merge: shared (user doc) + device (sessions)
  useEffect(() => {
    const unsub = listenToAuth(async (user) => {
      if (!user) {
        dispatch({ type: "LOGOUT" });
        return;
      }

      const deviceId = ensureDeviceId();

      const authPayload = {
        isAuthed: true,
        user: {
          id: user.uid,
          name: user.displayName || (user.email ? user.email.split("@")[0] : "User"),
          email: user.email || null,
          provider: user.providerData?.[0]?.providerId || "password",
        },
      };

      // Unlock routes immediately
      dispatch({ type: "LOAD_SAVED", payload: { auth: authPayload } });

      const local = readLocal(LS_KEY) || {};
      try {
        const [remote, deviceDoc] = await Promise.all([
          loadUserStateWithFallback(user.uid),   // shared: kit + settings (+activeDrumId)
          loadDeviceState(user.uid, deviceId),   // device: sessions (+ maybe last active)
        ]);

        // KIT: prefer cloud if present, else local; seed cloud if only local exists
        const remoteKit = remote?.kit ?? initialState.kit;
        const mergedKit = preferLocalKit(remoteKit, local.kit);

        if (kitCount(remoteKit) === 0 && kitCount(local.kit) > 0) {
          // seed cloud from local (fire-and-forget)
          patchUserState(user.uid, { kit: mergedKit }).catch(() => {});
          saveKit(user.uid, mergedKit).catch(() => {});
        }

        // SETTINGS: prefer remote (so all devices align), then local, then defaults
        const mergedSettings = {
          ...initialState.settings,
          ...(remote?.settings || {}),
          ...(local?.settings || {}),
        };

        // SESSIONS: device-local
        const mergedSessions = Array.isArray(deviceDoc?.sessions)
          ? deviceDoc.sessions
          : (local.sessions ?? []);

        const mergedActiveDrumId =
          remote?.activeDrumId ?? local.activeDrumId ?? mergedKit.drums[0]?.id ?? null;

        dispatch({
          type: "LOAD_SAVED",
          payload: {
            auth: authPayload,
            kit: mergedKit,
            settings: mergedSettings,
            sessions: mergedSessions,
            activeDrumId: mergedActiveDrumId,
          },
        });
      } catch (e) {
        console.error("Firestore hydrate error:", e);
        // Fallback to local cache only
        const fallbackKit = normalizeKit(local.kit ?? initialState.kit);
        const fallbackSettings = { ...initialState.settings, ...(local.settings || {}) };
        dispatch({
          type: "LOAD_SAVED",
          payload: {
            auth: authPayload,
            kit: fallbackKit,
            settings: fallbackSettings,
            sessions: local.sessions ?? [],
            activeDrumId: local.activeDrumId ?? fallbackKit.drums[0]?.id ?? null,
          },
        });
      }

      hydratedRef.current = true;
    });

    return () => unsub();
  }, []);

  // Persist local cache + Cloud (shared + device). Skip until hydrated.
  useEffect(() => {
    if (!hydratedRef.current) return;

    // Local fast-boot cache
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
      const deviceId = ensureDeviceId();

      // Debounced cloud writes:
      debounceCloudSave(uid, () => {
        const sharedPatch = {
          kit: state.kit,                 // SHARED
          settings: state.settings,       // SHARED
          activeDrumId: state.activeDrumId,
        };
        const devicePatch = {
          sessions: state.sessions,       // DEVICE-LOCAL
        };

        Promise.all([
          patchUserState(uid, sharedPatch),
          saveKit(uid, state.kit),
          saveDeviceState(uid, deviceId, devicePatch),
        ]).catch(() => {});
      });
    }
  }, [state.auth, state.kit, state.settings, state.sessions, state.activeDrumId]);

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
        try { localStorage.removeItem(LS_KEY); } catch {}
        dispatch({ type: "CLEAR_ALL" });
      },
    }),
    [state]
  );

  return <Ctx.Provider value={{ state, actions }}>{children}</Ctx.Provider>;
}
