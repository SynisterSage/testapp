// src/lib/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

function readFirebaseConfig() {
  const raw = import.meta.env.VITE_FIREBASE;
  if (!raw) {
    console.error("[firebase] Missing VITE_FIREBASE env in production.");
    return null;
  }
  try {
    const cfg = JSON.parse(raw);
    if (!cfg.apiKey || !cfg.projectId || !cfg.appId) {
      console.error("[firebase] VITE_FIREBASE missing required keys:", cfg);
      return null;
    }
    return cfg;
  } catch (e) {
    console.error("[firebase] Failed to parse VITE_FIREBASE:", raw, e);
    return null;
  }
}

const firebaseConfig = readFirebaseConfig();

// If misconfigured, render a soft-failure banner so the app isn’t “just blank”
if (!firebaseConfig && typeof document !== "undefined") {
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#0b0f14;color:#fff;font:14px/1.4 system-ui;z-index:99999;padding:24px;text-align:center";
  el.innerHTML =
    "App can’t start: missing Firebase env. Set <code>VITE_FIREBASE</code> in Vercel → Project → Settings → Environment Variables, then redeploy.";
  document.body.appendChild(el);
  throw new Error("Firebase config missing");
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
