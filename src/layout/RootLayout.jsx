import { useLocation } from "react-router-dom";
import TabBar from "./TabBar.jsx";
import { ToastViewport } from "../ui/ToastProvider.jsx";
import { Analytics } from "@vercel/analytics/next"

export default function RootLayout({ children }) {
  const { pathname } = useLocation();
  const hideTabs = pathname === "/login" || pathname === "/signup"; // ⬅️ add signup

  return (
    <div className="app-outer">
      <div className="app-shell">
        <main role="main" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          {children}
        </main>
        {!hideTabs && <TabBar />}
        <ToastViewport />
      </div>
    </div>
  );
}
