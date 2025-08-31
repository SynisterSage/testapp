// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// ✅ load your styles (make sure these files exist under /src/styles/)
import "./styles/tokens.css";
import "./styles/global.css";

// ✅ AppProvider is a DEFAULT export in your file
import AppProvider from "./store/AppProvider.jsx";
import { ToastProvider } from "./ui/ToastProvider.jsx";

// Small error boundary so crashes aren’t an invisible white screen
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error("ErrorBoundary caught:", err, info); }
  render() {
    if (this.state.err) {
      const msg = String(this.state.err?.stack || this.state.err);
      return (
        <pre style={{ padding:16, whiteSpace:"pre-wrap", fontFamily:"monospace",
                      color:"#111", background:"#f7f7f7" }}>
          🔥 React crashed:
          {"\n\n"}{msg}
        </pre>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AppProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
