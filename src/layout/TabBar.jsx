import { NavLink } from "react-router-dom";

function Tab({ to, label, icon }) {
  return (
    <NavLink to={to} className={({ isActive }) => "tab" + (isActive ? " tab--active" : "")}>
      <div className="tab-icon" aria-hidden="true">{icon}</div>
      <div className="tab-label">{label}</div>
    </NavLink>
  );
}

export default function TabBar() {
  return (
    <nav className="tabbar" aria-label="Primary">
      <Tab
        to="/"
        label="Home"
        icon={<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 10.5 12 3l9 7.5V21H3V10.5z" fill="none" stroke="currentColor" strokeWidth="1.7"/></svg>}
      />
      <Tab
        to="/kit"
        label="Kit"
        icon={<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="10" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M4 10v5c0 3 4 4.5 8 4.5s8-1.5 8-4.5v-5" fill="none" stroke="currentColor" strokeWidth="1.7"/></svg>}
      />
      <Tab
        to="/tuner"
        label="Tuner"
        icon={<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M12 5v7l4 3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>}
      />
      <Tab
        to="/settings"
        label="Settings"
        icon={<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.12"/><path d="M19.4 15a8 8 0 0 0 0-6l2.1-1.2-2-3.4-2.4 1.4a8 8 0 0 0-5.2-2L11.4 1H8.6l-.5 2.8a8 8 0 0 0-5.2 2L.6 4.4l-2 3.4L.7 9A8 8 0 0 0 .7 15l-2.1 1.2 2 3.4 2.4-1.4a8 8 0 0 0 5.2 2l.5 2.8h2.8l.5-2.8a8 8 0 0 0 5.2-2l2.4 1.4 2-3.4L19.4 15z" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>}
      />
    </nav>
  );
}
