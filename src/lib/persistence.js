let t = null;

export function persistLocal(key, obj) {
  try { localStorage.setItem(key, JSON.stringify(obj)); } catch {}
}

export function readLocal(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}

export function debounceCloudSave(fn, ms = 600) {
  clearTimeout(t);
  t = setTimeout(fn, ms);
}
