import { useState } from "react";
import { useAppStore } from "../store/AppProvider.jsx";
import { useToast } from "../ui/ToastProvider.jsx";   // NEW

export default function Settings() {
  const { state, actions } = useAppStore();
  const { show } = useToast();                        // NEW
  const [local, setLocal] = useState(state.settings);

  function update(patch) {
    const next = { ...local, ...patch };
    setLocal(next);
    actions.updateSettings(patch);
  }

  async function requestMic() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      s.getTracks().forEach(t => t.stop());
      show("Mic permission granted ✅");              // NEW
    } catch (e) {
      show("Mic permission failed ❌");               // NEW
    }
  }

  function clearData() {
    if (confirm("Clear all local data and reset app?")) {
      actions.clearAll();
      show("Cleared local data 🧹");                  // NEW
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
      <header className="topbar">
        <div className="brand-text">
          <span className="headline">Settings</span>
          <span className="sub">permissions • detection • theme</span>
        </div>
        <button className="ghost-btn" onClick={requestMic}>Request Mic</button>
      </header>

      <section className="panel">
        <h3 className="panel-title">Detection</h3>

        <div className="field">
          <label>Bandpass (Hz)</label>
          <div className="field-row">
            <input
              type="number"
              value={local.bandpassLowHz}
              onChange={(e) => update({ bandpassLowHz: Number(e.target.value || 0) })}
              min="20" max="400" step="1"
              aria-label="Bandpass low Hz"
            />
            <span>to</span>
            <input
              type="number"
              value={local.bandpassHighHz}
              onChange={(e) => update({ bandpassHighHz: Number(e.target.value || 0) })}
              min="60" max="1000" step="1"
              aria-label="Bandpass high Hz"
            />
          </div>
          <div className="hint">Kick ~40–180 • Toms ~60–400 • Snare ~140–350</div>
        </div>

        <div className="field">
          <label>Onset Sensitivity (RMS threshold)</label>
          <input
            type="range"
            min="0.005" max="0.08" step="0.005"
            value={local.rmsThreshold}
            onChange={(e) => update({ rmsThreshold: Number(e.target.value) })}
          />
          <div className="hint">Current: {local.rmsThreshold.toFixed(3)}</div>
        </div>

        <div className="field">
          <label>Hold (ms)</label>
          <input
            type="range"
            min="150" max="500" step="10"
            value={local.holdMs}
            onChange={(e) => update({ holdMs: Number(e.target.value) })}
          />
          <div className="hint">Current: {local.holdMs} ms</div>
        </div>
      </section>

      <section className="panel">
        <h3 className="panel-title">Appearance</h3>
        <div className="field">
          <label>Theme</label>
          <select
            value={local.theme || "dark"}
            onChange={(e) => update({ theme: e.target.value })}
          >
            <option value="dark">Dark (recommended)</option>
            <option value="light">Light</option>
            <option value="system">System</option>
          </select>
          <div className="hint">Changes apply instantly.</div>
        </div>
      </section>

      <section className="panel">
        <h3 className="panel-title">Danger Zone</h3>
        <button className="ghost-btn" onClick={clearData}>Clear Local Data</button>
      </section>

      <div style={{ color: "var(--text-dim)", fontSize: 12, textAlign: "center", marginTop: "auto" }}>
        v0.0.1 • local-only
      </div>
    </div>
  );
}
