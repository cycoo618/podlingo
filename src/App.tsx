import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DiscoverPage from './components/Discover/DiscoverPage';
import PlayerPage from './components/Player/PlayerPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DiscoverPage />} />
        <Route path="/player/:id" element={<PlayerPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
