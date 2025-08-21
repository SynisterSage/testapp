import React, { createContext, useContext, useMemo, useRef, useState } from "react";

const ToastCtx = createContext(null);

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  function show(message, { type = "success", duration = 1800 } = {}) {
    const id = uid();
    setToasts(t => [...t, { id, message, type }]);
    // auto-remove
    setTimeout(() => {
      setToasts(t => t.filter(x => x.id !== id));
    }, duration);
    return id;
  }

  const api = useMemo(() => ({ show, _get: () => toasts }), [toasts]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

/** Renders inside the phone shell so it's scoped to the frame */
export function ToastViewport() {
    const { _get } = useToast();
    const toasts = _get();
  
    return (
      <div className="toasts" role="status" aria-live="polite" aria-atomic="true">
        {toasts.map(t => (
          <div key={t.id} className="toast-wrap">
            <div className="toast-scrim" />
            <div className={`toast toast--${t.type}`}>
              <div className="toast-icon" aria-hidden="true">
                {t.type === "success" ? "✓" : "•"}
              </div>
              <div className="toast-msg">{t.message}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }
  