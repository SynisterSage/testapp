import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate, Navigate } from "react-router-dom";
import { useAppStore } from "../store/AppProvider.jsx";
import { useToast } from "../ui/ToastProvider.jsx";
import "../styles/login.css"; // reuse your login styles

export default function Signup() {
  const { state, actions } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  const toastApi = (() => { try { return useToast(); } catch { return { show: () => {} }; } })();
  const { show } = toastApi;

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  // if already authed, leave this page
  if (state?.auth?.isAuthed) {
    return <Navigate to={from} replace />;
  }

  async function handleSignup(provider) {
    if (loading) return;
    setLoading(true);
    try {
      if (provider === "google") {
        const cred = await actions.loginGoogle(); // Google can create new users too
        const u = cred?.user;
        show?.(`Welcome, ${u?.email || u?.displayName || "new user"} 🎉`);
        navigate(from, { replace: true });
        return;
      }

      // email/password path
      if (!email || !pwd) throw new Error("Please enter email and password.");
      if (pwd.length < 6) throw new Error("Password must be at least 6 characters.");
      if (pwd !== confirmPwd) throw new Error("Passwords don’t match.");

      const displayName = email.split("@")[0];
      const cred = await actions.registerEmail(email, pwd, displayName);
      const u = cred?.user;
      show?.(`Account created for ${u?.email || displayName} ✅`);
      navigate(from, { replace: true });
    } catch (e) {
      // map common Firebase errors to friendlier text
      const code = e?.code || "";
      let msg =
        code === "auth/email-already-in-use" ? "Email already in use."
      : code === "auth/invalid-email" ? "Invalid email address."
      : code === "auth/weak-password" ? "Password too weak (min 6 chars)."
      : e?.message || "Sign up failed.";
      console.error("Signup error:", code, e?.message);
      show?.(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ot-login">
      <div className="ot-surface">
        <h1 className="ot-brand">OVERTONE</h1>
        <p className="ot-sub">Create your account</p>

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

        <div className="ot-field">
          <label className="ot-label">Confirm Password</label>
          <input
            className="ot-input"
            type={showPwd ? "text" : "password"}
            placeholder="••••••••"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            disabled={loading}
            aria-label="Confirm Password"
          />
        </div>

        <button
          className={`ot-btn ot-btn-primary ${loading ? "is-loading" : ""}`}
          disabled={loading}
          onClick={() => handleSignup("email")}
          aria-busy={loading}
        >
          <span className="ot-btn-label">Create Account</span>
          <span className="ot-btn-spinner" aria-hidden="true" />
        </button>

        <div className="ot-divider"><span>or</span></div>

        <button
          className="ot-btn ot-btn-google"
          disabled={loading}
          onClick={() => handleSignup("google")}
        >
          Continue with Google
        </button>

       <p className="ot-sub" style={{ marginTop: 12, textAlign: "center" }}>
         Have an account?{" "}
         <Link to="/login" className="signup-link">
           Back to Sign In
         </Link>
       </p>
      </div>

      {loading && (
        <div className="ot-loading">
          <div className="ot-loading-card">
            <div className="ot-loading-spinner" />
            <div className="ot-loading-text">Creating your account…</div>
          </div>
        </div>
      )}
    </div>
  );
}
