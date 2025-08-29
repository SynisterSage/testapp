// src/lib/persistence.js
let timers = {};

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
