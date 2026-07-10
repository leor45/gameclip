import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { AppVersionInfo } from '@shared/ipc';
import { AuthProvider, useAuth } from './auth/AuthContext';
import AuthGate from './auth/AuthGate';
import CaptureBar from './components/CaptureBar';
import Sidebar from './components/Sidebar';
import Ajustes from './views/Ajustes';
import Biblioteca from './views/Biblioteca';
import Editor from './views/Editor';

function Shell() {
  const [versionInfo, setVersionInfo] = useState<AppVersionInfo | null>(null);

  useEffect(() => {
    window.gameclip
      .getAppVersion()
      .then(setVersionInfo)
      .catch(() => setVersionInfo(null));
  }, []);

  return (
    <div className="app-shell">
      <Sidebar versionInfo={versionInfo} />
      <div className="app-main">
        <CaptureBar />
        <main className="app-content">
          <Routes>
            <Route path="/" element={<Navigate to="/biblioteca" replace />} />
            <Route path="/biblioteca" element={<Biblioteca />} />
            <Route path="/editor" element={<Editor />} />
            <Route path="/ajustes" element={<Ajustes />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function Root() {
  const { session } = useAuth();
  return session ? <Shell /> : <AuthGate />;
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Root />
      </HashRouter>
    </AuthProvider>
  );
}
