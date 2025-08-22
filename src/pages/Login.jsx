import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/AppProvider.jsx";
import { useToast } from "../ui/ToastProvider.jsx";
import "../styles/login.css"; // <= per your request

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
  const [remember, setRemember] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  function finishLogin(provider, nameHint, emailHint) {
    if (loading) return;

    const name =
      nameHint ||
      (emailHint ? (emailHint.split("@")[0] || "User") : "") ||
      (provider === "google" ? "Google User" : "Guest");

    try { actions.loginFake(provider, name); } catch (e) {
      console.error("loginFake missing on actions — check AppProvider exports.", e);
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      try { show?.(`Signed in as ${name} ✅${remember ? " • remembered" : ""}`); } catch {}
      navigate("/", { replace: true });
    }, 700);
  }

  return (
    <div className="ot-login">
      <div className="ot-surface">
        <h1 className="ot-brand">OVERTONE</h1>
        <p className="ot-sub">Sign in to tune your kit</p>

        <div className="ot-field">
          <label className="ot-label">Email</label>
          <input
            className="ot-input"
            type="email"
            placeholder="name@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            aria-label="Email"
          />
        </div>

        <div className="ot-field ot-password">
          <label className="ot-label">Password</label>
          <input
            className="ot-input"
            type={showPwd ? "text" : "password"}
            placeholder="••••••••"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            disabled={loading}
            aria-label="Password"
          />
          <button
            type="button"
            className="ot-eye"
            onClick={() => setShowPwd((s) => !s)}
            aria-label={showPwd ? "Hide password" : "Show password"}
            disabled={loading}
          >
            {/* eye / eye-off toggles purely by CSS using currentColor */}
            {showPwd ? (
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M2.1 3.51 3.51 2.1l18.39 18.39-1.41 1.41-2.38-2.38A12.6 12.6 0 0 1 12 20.5C6.7 20.5 2.27 17.18.5 12c.74-2.12 2-3.96 3.64-5.33L2.1 3.51ZM7.52 8.93l1.53 1.53a3 3 0 0 0 4.5 4.5l1.53 1.53A5 5 0 0 1 7.52 8.93ZM12 7a5 5 0 0 1 5 5c0 .65-.12 1.27-.33 1.83l3.03 3.03C21.9 15.61 23 13.93 23.5 12 21.73 6.82 17.3 3.5 12 3.5c-1.25 0-2.45.18-3.57.52l2.06 2.06C10.73 7.12 11.35 7 12 7Z"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M12 5c6 0 10 4.5 11 7-1 2.5-5 7-11 7S2 14.5 1 12c1-2.5 5-7 11-7Zm0 2C7.58 7 4.06 9.94 3.05 12 4.06 14.06 7.58 17 12 17s7.94-2.94 8.95-5C19.94 9.94 16.42 7 12 7Zm0 2.5A2.5 2.5 0 1 1 9.5 12 2.5 2.5 0 0 1 12 9.5Z"/>
              </svg>
            )}
          </button>
        </div>

        <label className="ot-remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            disabled={loading}
          />
          <span>Remember me</span>
        </label>

        <button
          className={`ot-btn ot-btn-primary ${loading ? "is-loading" : ""}`}
          disabled={loading}
          onClick={() => finishLogin("email", email.split("@")[0] || "User", email)}
          aria-busy={loading}
        >
          <span className="ot-btn-label">Sign In</span>
          <span className="ot-btn-spinner" aria-hidden="true" />
        </button>

        <div className="ot-divider"><span>or</span></div>

        <button
          className="ot-btn ot-btn-google"
          disabled={loading}
          onClick={() => finishLogin("google", "Google User", "user@example.com")}
        >
          <span className="ot-google-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 256 262" xmlns="http://www.w3.org/2000/svg">
              <path fill="#4285F4" d="M255.9 133.5c0-10.1-.9-20-2.8-29.6H130v56h71.1c-3.1 17-12.2 31.4-26.1 41v33.9h42.2c24.7-22.8 38.7-56.4 38.7-101.3z"/>
              <path fill="#34A853" d="M130 261.1c35.1 0 64.6-11.6 86.2-31.3l-42.2-33.9c-11.7 7.9-26.8 12.6-44 12.6-33.8 0-62.4-22.8-72.6-53.5H14.2v33.7C35.7 235.1 79.7 261.1 130 261.1z"/>
              <path fill="#FBBC05" d="M57.4 154.9c-2.7-8-4.3-16.6-4.3-25.4s1.6-17.4 4.3-25.4V70.4H14.2C5.1 88.3 0 109.1 0 129.5s5.1 41.2 14.2 59.1l43.2-33.7z"/>
              <path fill="#EA4335" d="M130 50.5c19.1 0 36.1 6.6 49.6 19.6l37.2-37.2C194.4 12 165 0 130 0 79.7 0 35.7 26 14.2 70.4l43.2 33.7C67.6 73.4 96.2 50.5 130 50.5z"/>
            </svg>
          </span>
          Continue with Google
        </button>
      </div>

      {loading && (
        <div className="ot-loading">
          <div className="ot-loading-card">
            <div className="ot-loading-spinner" />
            <div className="ot-loading-text">Signing you in…</div>
          </div>
        </div>
      )}
    </div>
  );
}
