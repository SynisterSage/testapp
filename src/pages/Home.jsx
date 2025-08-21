import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/AppProvider.jsx";

function summarizeKit(drums) {
  if (!drums?.length) return null;
  const kick = drums.find(d => d.type === "kick");
  const snare = drums.find(d => d.type === "snare");
  const toms = drums.filter(d => d.type === "tom").map(d => d.size_in).sort((a,b)=>a-b);
  const pills = [];
  if (kick) pills.push(`${kick.size_in}″ Kick`);
  if (snare) pills.push(`${snare.size_in}″ Snare`);
  if (toms.length) pills.push(`${toms.join(" / ")}″ Toms`);
  return pills;
}

const IconTune = () => (
  <svg viewBox="0 0 24 24" width="18" height="18">
    <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M12 5v7l4 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);
const IconKit = () => (
  <svg viewBox="0 0 24 24" width="18" height="18">
    <ellipse cx="12" cy="9" rx="7" ry="3.5" fill="none" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M5 9v6c0 2.3 3.1 4 7 4s7-1.7 7-4V9" fill="none" stroke="currentColor" strokeWidth="1.8"/>
  </svg>
);
const IconSettings = () => (
  <svg viewBox="0 0 24 24" width="18" height="18">
    <path d="M19.4 15a8 8 0 0 0 0-6l2.1-1.2-2-3.4-2.4 1.4a8 8 0 0 0-5.2-2L11.4 1H8.6l-.5 2.8a8 8 0 0 0-5.2 2L.6 4.4l-2 3.4L.7 9A8 8 0 0 0 .7 15l-2.1 1.2 2 3.4 2.4-1.4a8 8 0 0 0 5.2 2l.5 2.8h2.8l.5-2.8a8 8 0 0 0 5.2-2l2.4 1.4 2-3.4L19.4 15z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <circle cx="12" cy="12" r="3" fill="currentColor" opacity=".16"/>
  </svg>
);

const ArrowBadge = () => (
  <span className="tile-arrow" aria-hidden="true">
    <svg viewBox="0 0 24 24">
      <path d="M8 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

function formatWhen(ts) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameDay ? `Today • ${time}` : d.toLocaleDateString([], { month: "short", day: "numeric" }) + ` • ${time}`;
}
function drumLabel(drum) {
  if (!drum) return "Unknown drum";
  const t = drum.type.charAt(0).toUpperCase() + drum.type.slice(1);
  return drum.size_in ? `${drum.size_in}″ ${t}` : t;
}

export default function Home() {
  const navigate = useNavigate();
  const { state } = useAppStore();
  const kitPills = useMemo(() => summarizeKit(state.kit.drums), [state.kit.drums]);
  const recent = state.sessions?.slice(0, 1) ?? [];

  // live time-of-day (updates every minute)
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);
  const timeStr = useMemo(
    () => new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(now),
    [now]
  );

  return (
    <div className="home-compact" style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
      {/* Top bar */}
      <header className="dash-top">
        <div className="brand-tag">
          <div className="brand-tag-title">OVERTONE</div>
          <div className="brand-tag-sub">Mobile Drum Tuner</div>
        </div>
        <button className="top-gear" aria-label="Settings" onClick={() => navigate("/settings")}>⚙︎</button>
      </header>

      {/* Welcome row with time-of-day */}
      <div className="welcome-row">
        <h1 className="dash-welcome">Welcome Back!</h1>
        <div className="welcome-time" aria-label="Current time">{timeStr}</div>
      </div>

      {/* Hero */}
      <section className="dash-hero">
        <h2 className="dash-hero-title">Tune Fast with<br/>Overtone.</h2>
        <p className="dash-hero-sub">Set your kit once, then tune freely.</p>
        <button className="cta-btn" onClick={() => navigate("/tuner")}>Start Tuning!</button>
      </section>

      {/* Grid */}
      <section className="dash-grid">
        {/* Row 1: YOUR KIT (wide, scrollable pills) */}
        <div className="dash-tile dash-tile--wide dash-tile--kit" onClick={() => navigate("/kit")} role="button" tabIndex={0}>
          <div className="tile-head">
            <div className="tile-icon"><IconKit/></div>
            <div className="tile-title">Your Kit</div>
          </div>
          <div className="tile-sub">Sizes, lugs, targets</div>

          <div className="kit-strip kit-strip--scroll mask-fade-right">
            {kitPills
              ? kitPills.map(p => <span key={p} className="kit-pill">{p}</span>)
              : <span className="kit-empty">No kit yet</span>}
          </div>

          <ArrowBadge />
        </div>

        {/* Row 2: RECENT SESSIONS (wide) */}
        <div className="dash-tile dash-tile--wide dash-tile--sessions" onClick={() => navigate("/tuner")} role="button" tabIndex={0}>
          <div className="tile-head">
            <div className="tile-icon">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 7v5l3 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <div className="tile-title">Recent Sessions</div>
          </div>

          {recent.length ? (
            <div className="session-list session-list--compact">
              {recent.map((s) => {
                const drum = state.kit.drums.find(d => d.id === s.drumId);
                const cents = Math.round(s.cents || 0);
                const centsClass = cents === 0 ? "" : cents > 0 ? "cents-pos" : "cents-neg";
                return (
                  <div key={s.id} className="session-item">
                    <div className="sess-left">
                      <div className="sess-drum">{drumLabel(drum)}</div>
                      <div className="sess-meta">{formatWhen(s.at)}</div>
                    </div>
                    <div className="sess-metrics">
                      <span className="sess-chip">{Math.round(s.hz)} Hz</span>
                      <span className={`sess-chip ${centsClass}`}>{cents > 0 ? `+${cents}` : cents}¢</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="session-empty session-empty--compact">
              No sessions yet
            </div>
          )}

          <ArrowBadge />
        </div>

        {/* Row 3: TUNE + SETTINGS (half tiles) */}
        <button className="dash-tile dash-tile--equal" onClick={() => navigate("/tuner")}>
          <div className="tile-head">
            <div className="tile-icon"><IconTune/></div>
            <div className="tile-title">Tune</div>
          </div>
          <div className="tile-sub">Live HZ & Cents</div>
          <ArrowBadge />
        </button>

        <button className="dash-tile dash-tile--equal" onClick={() => navigate("/settings")}>
          <div className="tile-head">
            <div className="tile-icon"><IconSettings/></div>
            <div className="tile-title">Settings</div>
          </div>
          <div className="tile-sub">Detection & Appearance</div>
          <ArrowBadge />
        </button>
      </section>

      <div className="spacer-bottom" />
    </div>
  );
}
