import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { AppVersionInfo } from '@shared/ipc';
import { AuthProvider, useAuth } from './auth/AuthContext';
import AuthGate from './auth/AuthGate';
import CaptureBar from './components/CaptureBar';
import Sidebar from './components/Sidebar';
import AjustesLayout from './views/ajustes/AjustesLayout';
import AjustesAlmacenamiento from './views/ajustes/Almacenamiento';
import AjustesAtajos from './views/ajustes/Atajos';
import AjustesAudio from './views/ajustes/Audio';
import AjustesAvanzado from './views/ajustes/Avanzado';
import AjustesCalidad from './views/ajustes/Calidad';
import AjustesDesarrollo from './views/ajustes/Desarrollo';
import AjustesGeneral from './views/ajustes/General';
import AjustesGrabacion from './views/ajustes/Grabacion';
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
            <Route path="/editor/:clipId" element={<Editor />} />
            <Route path="/ajustes" element={<AjustesLayout />}>
              <Route index element={<Navigate to="grabacion" replace />} />
              <Route path="grabacion" element={<AjustesGrabacion />} />
              <Route path="general" element={<AjustesGeneral />} />
              <Route path="calidad" element={<AjustesCalidad />} />
              <Route path="audio" element={<AjustesAudio />} />
              <Route path="atajos" element={<AjustesAtajos />} />
              <Route path="almacenamiento" element={<AjustesAlmacenamiento />} />
              <Route path="avanzado" element={<AjustesAvanzado />} />
              <Route path="desarrollo" element={<AjustesDesarrollo />} />
            </Route>
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
