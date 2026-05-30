import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import DiscoverPage from './components/Discover/DiscoverPage';
import PlayerPage from './components/Player/PlayerPage';
import LoginPage from './components/Auth/LoginPage';
import VocabPage from './components/Vocabulary/VocabPage';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<DiscoverPage />} />
      <Route path="/player/:id" element={<PlayerPage />} />
      <Route path="/vocab" element={<VocabPage />} />
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
