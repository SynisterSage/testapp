import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";

export const listenToAuth = (cb) => onAuthStateChanged(auth, cb);

export const loginWithEmail = (email, pwd) =>
  signInWithEmailAndPassword(auth, email, pwd);

export const registerWithEmail = async (email, pwd, displayName) => {
  const cred = await createUserWithEmailAndPassword(auth, email, pwd);
  if (displayName) await updateProfile(cred.user, { displayName });
  return cred;
};

export const loginWithGoogle = () => signInWithPopup(auth, googleProvider);

export const logoutFirebase = () => signOut(auth);
