import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { AppVersionInfo } from '@shared/ipc';
import Sidebar from './components/Sidebar';
import Ajustes from './views/Ajustes';
import Biblioteca from './views/Biblioteca';
import Editor from './views/Editor';

export default function App() {
  const [versionInfo, setVersionInfo] = useState<AppVersionInfo | null>(null);

  useEffect(() => {
    window.gameclip
      .getAppVersion()
      .then(setVersionInfo)
      .catch(() => setVersionInfo(null));
  }, []);

  return (
    <HashRouter>
      <div className="app-shell">
        <Sidebar versionInfo={versionInfo} />
        <main className="app-content">
          <Routes>
            <Route path="/" element={<Navigate to="/biblioteca" replace />} />
            <Route path="/biblioteca" element={<Biblioteca />} />
            <Route path="/editor" element={<Editor />} />
            <Route path="/ajustes" element={<Ajustes />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
