import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAppStore } from "../store/AppProvider.jsx";

export default function ProtectedRoute({ children }) {
  const { state } = useAppStore();
  const loc = useLocation();

  if (!state?.auth?.isAuthed) {
    return <Navigate to="/login" replace state={{ from: loc }} />;
  }
  return children;
}
