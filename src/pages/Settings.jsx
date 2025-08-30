import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/AppProvider.jsx";

// Safe toast (works even if ToastProvider isn't mounted)
let safeToast = { show: () => {} };
try { safeToast = require("../ui/ToastProvider.jsx").useToast(); } catch {}

function useClock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 30_000); return () => clearInterval(id); }, []);
  const h = t.getHours();
  const h12 = ((h + 11) % 12) + 1;
  const m = String(t.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h12}:${m} ${ampm}`;
}

export default function Settings() {
  const { state, actions } = useAppStore();
  const { show } = safeToast;
  const navigate = useNavigate();
  const clock = useClock();

  const s = state.settings ?? {};
  const [bandLow, setBandLow]   = useState(s.bandpassLowHz  ?? 60);
  const [bandHigh, setBandHigh] = useState(s.bandpassHighHz ?? 400);
  const [rms, setRms]           = useState(s.rmsThreshold   ?? 0.02);
  const [holdMs, setHoldMs]     = useState(s.holdMs         ?? 300);
  const [theme, setTheme]       = useState(s.theme          ?? "dark");

  useEffect(() => { if (bandLow > bandHigh) setBandLow(bandHigh); }, [bandHigh]);
  useEffect(() => { if (bandHigh < bandLow) setBandHigh(bandLow); }, [bandLow]);

  useEffect(() => { actions.updateSettings?.({ bandpassLowHz: Number(bandLow) }); }, [bandLow]);
  useEffect(() => { actions.updateSettings?.({ bandpassHighHz: Number(bandHigh) }); }, [bandHigh]);
  useEffect(() => { actions.updateSettings?.({ rmsThreshold: Number(rms) }); }, [rms]);
  useEffect(() => { actions.updateSettings?.({ holdMs: Number(holdMs) }); }, [holdMs]);
  useEffect(() => { actions.updateSettings?.({ theme }); }, [theme]);

  // header mic request
  const [micStatus, setMicStatus] = useState("idle");
  async function requestMic() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicStatus("unavailable"); show?.("Mic not supported in this browser"); return;
    }
    setMicStatus("loading");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicStatus("ok");
      show?.("Microphone enabled ✅");
    } catch (e) {
      const n = e?.name || "";
      setMicStatus(
        n === "NotAllowedError" || n === "SecurityError" ? "denied"
        : n === "NotFoundError" ? "noinput"
        : "error"
      );
      show?.("Could not access microphone");
    }
  }

  function handleLogout() {
    actions.logout?.();
    navigate("/login", { replace: true });
  }

  return (
    <div className="settings-page">
      {/* Header (brand + Request Mic) */}
      <div className="dash-top">
        <div>
          <div className="brand-tag-title">OVERTONE</div>
          <div className="brand-tag-sub">Mobile Drum Tuner</div>
        </div>
        <button className="top-cta" onClick={requestMic} aria-label="Request microphone access">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="1.6"/>
            <path d="M5 11v1a7 7 0 0 0 14 0v-1" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12 19v3" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <span>Request Mic</span>
        </button>
      </div>

      {/* Title + clock */}
      <div className="dash-welcome" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div className="tile-title">Settings</div>
        <div className="top-clock">{clock}</div>
      </div>

      {/* Cards */}
      <div className="settings-cards">
        {/* Detection */}
        <section className="panel settings-card" style={{ marginBottom: "1px" }}>
          <div className="panel-title">Detection</div>

          <div className="field">
            <label>Bandpass (Hz)</label>
            <div className="range-pair">
              <input
                type="number" min="20" max="400" step="5"
                value={bandLow}
                onChange={(e) => setBandLow(Number(e.target.value || 60))}
              />
              <span className="range-sep">to</span>
              <input
                type="number" min="200" max="1200" step="10"
                value={bandHigh}
                onChange={(e) => setBandHigh(Number(e.target.value || 400))}
              />
            </div>
            <div className="hint">Kick ~40–180 • Toms ~60–400 • Snare ~140–350</div>
          </div>

          <div className="field">
            <label>Onset Sensitivity (RMS threshold)</label>
            <input
              type="range"
              min="0.005" max="0.1" step="0.005"
              value={rms}
              onChange={(e) => setRms(Number(e.target.value))}
            />
            <div className="hint">Current: {Number(rms).toFixed(3)}</div>
          </div>

          <div className="field">
            <label>Hold (ms)</label>
            <input
              type="range"
              min="100" max="1200" step="50"
              value={holdMs}
              onChange={(e) => setHoldMs(Number(e.target.value))}
            />
            <div className="hint">Current: {holdMs} ms</div>
          </div>
        </section>

        {/* Appearance */}
        <section className="panel settings-card">
          <div className="panel-title">Appearance</div>

          <div className="field">
            <label>Theme</label>
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="dark">Dark (recommended)</option>
              <option value="light">Light</option>
            </select>
            <div className="hint">Changes apply instantly.</div>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="panel settings-card">
          <div className="panel-title">Danger Zone</div>
          <button
            className="ghost-btn"
            onClick={() => { actions.clearAll?.(); show?.("Local data cleared"); }}
          >
            Clear Local Data
          </button>
        </section>
      </div>

      {/* Standalone, centered logout button (NOT a card) */}
      <div className="settings-logout">
        <button className="primary-btn danger-btn" onClick={handleLogout}>
          Log out
        </button>
      </div>

      {/* tiny footer */}
      <div className="settings-foot hint" style={{ textAlign: "center", marginTop: "15px"}}>
        v0.0.8 • Beta Testing • Lex
      </div>
    </div>
  );
}
