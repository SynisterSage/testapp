import { useLocation } from "react-router-dom";
import TabBar from "./TabBar.jsx";
import { ToastViewport } from "../ui/ToastProvider.jsx";

export default function RootLayout({ children }) {
  const { pathname } = useLocation();
  const hideTabs = pathname === "/login";

  return (
    <div className="app-outer">
      <div className="app-shell">
        <main style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          {children}
        </main>
        {!hideTabs && <TabBar />}
        <ToastViewport />
      </div>
    </div>
  );
}
