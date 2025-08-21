// routes/ProtectedRoute.jsx
import { Navigate } from "react-router-dom";
import { useAppStore } from "../store/AppProvider.jsx";

export default function ProtectedRoute({ children }) {
  const { state } = useAppStore();
  return state.auth.isAuthed ? children : <Navigate to="/login" replace />;
}
