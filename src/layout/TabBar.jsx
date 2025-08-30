// TabBar.jsx
import { NavLink } from "react-router-dom";
import { Home, Drum, Clock3, Settings } from "lucide-react"; // icons

function Tab({ to, label, Icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => "tab" + (isActive ? " tab--active" : "")}
    >
      <div className="tab-icon" aria-hidden="true">
        <Icon size={22} strokeWidth={1.7} />
      </div>
      <div className="tab-label">{label}</div>
    </NavLink>
  );
}

export default function TabBar() {
  return (
    <nav className="tabbar" aria-label="Primary">
      <Tab to="/" label="Home" Icon={Home} />
      <Tab to="/kit" label="Kit" Icon={Drum} />
      <Tab to="/tuner" label="Tuner" Icon={Clock3} />
      <Tab to="/settings" label="Settings" Icon={Settings} />
    </nav>
  );
}
