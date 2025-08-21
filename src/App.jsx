import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import RootLayout from "./layout/RootLayout.jsx";

import Home from "./pages/Home.jsx";
import Kit from "./pages/Kit.jsx";
import Tuner from "./pages/Tuner.jsx";
import Settings from "./pages/Settings.jsx";
import Login from "./pages/Login.jsx";               // NEW
import ProtectedRoute from "./routes/ProtectedRoute.jsx"; // NEW

export default function App() {
  return (
    <BrowserRouter>
      <RootLayout>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Protected */}
          <Route index element={
            <ProtectedRoute><Home /></ProtectedRoute>
          } />
          <Route path="/kit" element={
            <ProtectedRoute><Kit /></ProtectedRoute>
          } />
          <Route path="/tuner" element={
            <ProtectedRoute><Tuner /></ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute><Settings /></ProtectedRoute>
          } />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </RootLayout>
    </BrowserRouter>
  );
}
