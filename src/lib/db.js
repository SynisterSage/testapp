// src/lib/db.js
import { db } from "./firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

// ----- DOC REFS -----
const userDocRef = (uid) => doc(db, "users", uid);
// keep kit in a stable subdoc as well (more reliable merging)
const kitDocRef  = (uid) => doc(db, "users", uid, "state", "kit");

// ----- EXISTING API (kept so nothing breaks) -----
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

// ----- NEW, STABLE KIT ENDPOINTS (optional to adopt) -----
export async function loadKit(uid) {
  try {
    const snap = await getDoc(kitDocRef(uid));
    return snap.exists() ? snap.data() : null; // expect { drums: [...] }
  } catch (e) {
    console.error("[db] loadKit failed:", e);
    return null;
  }
}

export async function saveKit(uid, kit) {
  try {
    // write to subdoc
    await setDoc(kitDocRef(uid), kit || { drums: [] }, { merge: true });
    // mirror a copy at users/{uid} for backwards compatibility (safe)
    await setDoc(
      userDocRef(uid),
      { kit, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (e) {
    console.error("[db] saveKit failed:", e);
  }
}
