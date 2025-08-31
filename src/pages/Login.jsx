import React, { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAppStore } from "../store/AppProvider.jsx";
import { useToast } from "../ui/ToastProvider.jsx";
import "../styles/login.css";


export default function Login() {
  const { state, actions } = useAppStore();
  const toastApi = (() => { try { return useToast(); } catch { return { show: () => {} }; } })();
  const { show } = toastApi;

  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  // ✅ If already authed (e.g., after Google popup/redirect completes), leave /login immediately
  if (state?.auth?.isAuthed) {
    return <Navigate to={from} replace />;
  }

  async function signIn(provider) {
    if (loading) return;
    setLoading(true);
    try {
      let cred;
      if (provider === "google") {
        cred = await actions.loginGoogle();     // returns Firebase auth credential (if popup; redirect will complete via listener)
      } else {
        cred = await actions.loginEmail(email, pwd);
      }
      const u = cred?.user || state?.auth?.user;
      const label = u?.email || u?.name || email || "User";
      show?.(`Signed in as ${label} ✅${remember ? " • remembered" : ""}`);

      // Navigate to intended page (ProtectedRoute won't bounce now that auth flips immediately)
      navigate(from, { replace: true });
    } catch (e) {
      console.error("Sign-in error:", e?.code, e?.message);
      show?.(`Sign-in failed: ${e?.code || "check your credentials"}`);
    } finally {
      setLoading(false);
    }
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
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M12 5c6 0 10 4.5 11 7-1 2.5-5 7-11 7S2 14.5 1 12c1-2.5 5-7 11-7Zm0 2C7.58 7 4.06 9.94 3.05 12 4.06 14.06 7.58 17 12 17s7.94-2.94 8.95-5C19.94 9.94 16.42 7 12 7Zm0 2.5A2.5 2.5 0 1 1 9.5 12 2.5 2.5 0 0 1 12 9.5Z"/>
            </svg>
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
          onClick={() => signIn("email")}
          aria-busy={loading}
        >
          <span className="ot-btn-label">Sign In</span>
          <span className="ot-btn-spinner" aria-hidden="true" />
        </button>


        <div className="ot-divider"><span>or</span></div>

        <button
          className="ot-btn ot-btn-google"
          disabled={loading}
          onClick={() => signIn("google")}
        >
          Continue with Google
        </button>
        <p className="ot-sub" style={{ marginTop: 12, textAlign: "center" }}>
  New here?{" "}
  <Link to="/signup" className="signup-link">
    Create an account
  </Link>
</p>
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
