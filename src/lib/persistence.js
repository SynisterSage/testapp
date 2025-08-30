// src/lib/persistence.js
let timers = {};

// --- local storage helpers ---
export function persistLocal(key, obj) {
  try { localStorage.setItem(key, JSON.stringify(obj)); } catch {}
}

export function readLocal(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}

export function debounceCloudSave(uid, fn, ms = 600) {
  clearTimeout(timers[uid]);
  timers[uid] = setTimeout(fn, ms);
}

// --- device identity (per device, never synced) ---
export function ensureDeviceId() {
  try {
    let id = localStorage.getItem("__deviceId");
    if (!id) {
      const rand = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : "dev-" + Math.random().toString(36).slice(2) + "-" + Date.now();
      localStorage.setItem("__deviceId", rand);
      id = rand;
    }
    return id;
  } catch {
    // If localStorage is unavailable, fall back to a volatile ID
    return "dev-ephemeral-" + Date.now();
  }
}
