// src/lib/db.js
import { db } from "./firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

// ----- DOC REFS -----
const userDocRef   = (uid) => doc(db, "users", uid);
const kitDocRef    = (uid) => doc(db, "users", uid, "state", "kit");
const deviceDocRef = (uid, deviceId) => doc(db, "users", uid, "devices", deviceId);

// ----- USER-SCOPED (shared across devices) -----
export async function loadUserState(uid) {
  try {
    const snap = await getDoc(userDocRef(uid));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.error("[db] loadUserState failed:", e);
    return null;
  }
}

export async function saveUserState(uid, payload) {
  try {
    await setDoc(
      userDocRef(uid),
      { ...payload, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (e) {
    console.error("[db] saveUserState failed:", e);
  }
}

export async function patchUserState(uid, patch) {
  try {
    await setDoc(
      userDocRef(uid),
      { ...patch, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (e) {
    console.error("[db] patchUserState failed:", e);
  }
}

// Keep kit in a stable subdoc too (for reliability/back-compat)
export async function loadKit(uid) {
  try {
    const snap = await getDoc(kitDocRef(uid));
    return snap.exists() ? snap.data() : null; // { drums: [...] }
  } catch (e) {
    console.error("[db] loadKit failed:", e);
    return null;
  }
}

export async function saveKit(uid, kit) {
  try {
    await setDoc(kitDocRef(uid), kit || { drums: [] }, { merge: true });
    await setDoc(
      userDocRef(uid),
      { kit, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (e) {
    console.error("[db] saveKit failed:", e);
  }
}

// User doc with fallback to kit subdoc
export async function loadUserStateWithFallback(uid) {
  const userDoc = await loadUserState(uid);
  if (userDoc && userDoc.kit && Array.isArray(userDoc.kit?.drums)) return userDoc;
  const kitOnly = await loadKit(uid);
  if (kitOnly && Array.isArray(kitOnly.drums)) return { ...(userDoc || {}), kit: kitOnly };
  return userDoc; // could be null
}

// ----- DEVICE-SCOPED (device-local; we’ll use this for sessions) -----
export async function loadDeviceState(uid, deviceId) {
  try {
    const snap = await getDoc(deviceDocRef(uid, deviceId));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.error("[db] loadDeviceState failed:", e);
    return null;
  }
}

export async function saveDeviceState(uid, deviceId, payload) {
  try {
    await setDoc(
      deviceDocRef(uid, deviceId),
      { ...payload, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (e) {
    console.error("[db] saveDeviceState failed:", e);
  }
}
