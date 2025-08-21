import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

import "./styles/tokens.css";
import "./styles/global.css";

import { AppProvider } from "./store/AppProvider.jsx";
import { ToastProvider } from "./ui/ToastProvider.jsx";          // NEW

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppProvider>
      <ToastProvider>                                         {/* NEW */}
        <App />
      </ToastProvider>
    </AppProvider>
  </React.StrictMode>
);
