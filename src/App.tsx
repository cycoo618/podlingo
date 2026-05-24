import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import DiscoverPage from './components/Discover/DiscoverPage';
import PlayerPage from './components/Player/PlayerPage';
import LoginPage from './components/Auth/LoginPage';
import VocabPage from './components/Vocabulary/VocabPage';
import type { ReactNode } from 'react';

/** Redirect to /login if not authenticated; show spinner while auth state loads */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><DiscoverPage /></RequireAuth>} />
      <Route path="/player/:id" element={<RequireAuth><PlayerPage /></RequireAuth>} />
      <Route path="/vocab" element={<RequireAuth><VocabPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  );
}
