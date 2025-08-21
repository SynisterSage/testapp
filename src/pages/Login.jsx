import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/AppProvider.jsx";
import { useToast } from "../ui/ToastProvider.jsx";

export default function Login() {
  const { actions } = useAppStore();
  const toastApi = (() => {
    try { return useToast(); } catch { return { show: () => {} }; }
  })();
  const { show } = toastApi;

  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");

  function finishLogin(provider, nameHint, emailHint) {
    if (loading) return;

    // derive a friendly name for the fake profile
    const name =
      nameHint ||
      (emailHint ? (emailHint.split("@")[0] || "User") : "") ||
      (provider === "google" ? "Google User" : "Guest");

    // flip fake auth in the global store (this is the key bit)
    try {
      actions.loginFake(provider, name);
    } catch (e) {
      console.error("loginFake missing on actions — check AppProvider exports.", e);
    }

    // quick loading overlay + route to home
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      try { show?.(`Signed in as ${name} ✅`); } catch {}
      navigate("/", { replace: true });
    }, 600);
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">🥁</div>
        <h1 className="login-title">DrumTune</h1>
        <p className="login-sub">Sign in to tune your kit</p>

        <button
          className="login-btn login-google"
          disabled={loading}
          onClick={() => finishLogin("google", "Google User", "user@example.com")}
        >
          <span className="g">G</span> Continue with Google
        </button>

        <div className="login-or"><span>or</span></div>

        <div className="field">
          <label>Email</label>
          <input
            className="login-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="field">
          <label>Password</label>
          <input
            className="login-input"
            type="password"
            placeholder="••••••••"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            disabled={loading}
          />
        </div>

        <button
          className="primary-btn"
          style={{ marginTop: 8 }}
          disabled={loading}
          onClick={() => finishLogin("email", email.split("@")[0] || "User", email)}
        >
          Sign in with Email
        </button>

        <button
          className="ghost-btn"
          style={{ marginTop: 8 }}
          disabled={loading}
          onClick={() => finishLogin("guest", "Guest", "")}
        >
          Continue as Guest
        </button>

        <p className="login-legal">
          By continuing you agree to the demo’s fake auth. We’ll add real login later.
        </p>
      </div>

      {loading && (
        <div className="launch-overlay">
          <div className="launch-card">
            <div className="spinner" />
            <div className="launch-text">Signing you in…</div>
          </div>
        </div>
      )}
    </div>
  );
}
