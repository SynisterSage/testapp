import { Navigate } from "react-router-dom";
import { useAppStore } from "../store/AppProvider.jsx";

export default function ProtectedRoute({ children }) {
  const { state } = useAppStore();
  if (!state.auth.user) return <Navigate to="/login" replace />;
  return children;
}
