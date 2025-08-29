import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

function readFirebaseConfig() {
  const raw = import.meta.env.VITE_FIREBASE;
  if (!raw) throw new Error("Missing VITE_FIREBASE in .env.local");
  try {
    const cfg = JSON.parse(raw);
    // minimal sanity check
    if (!cfg.apiKey || !cfg.projectId || !cfg.appId) {
      throw new Error("VITE_FIREBASE JSON missing required fields (apiKey, projectId, appId).");
    }
    return cfg;
  } catch (e) {
    console.error("Failed to parse VITE_FIREBASE:", e);
    throw e;
  }
}

const firebaseConfig = readFirebaseConfig();

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
