import { db } from "./firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";

const userDocRef = (uid) => doc(db, "users", uid);

export async function loadUserState(uid) {
  const snap = await getDoc(userDocRef(uid));
  return snap.exists() ? snap.data() : null;
}

export async function saveUserState(uid, payload) {
  await setDoc(userDocRef(uid), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
}

export async function patchUserState(uid, patch) {
  await updateDoc(userDocRef(uid), { ...patch, updatedAt: serverTimestamp() });
}
