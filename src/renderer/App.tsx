import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { isSideMouseButton } from '@shared/hotkeys';
import type { AppVersionInfo } from '@shared/ipc';
import { AuthProvider, useAuth } from './auth/AuthContext';
import AuthGate from './auth/AuthGate';
import CaptureBar from './components/CaptureBar';
import Sidebar from './components/Sidebar';
import UpdateModal from './components/UpdateModal';
import { UpdateProvider } from './updates/UpdateContext';
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
import EditorAvanzado from './views/EditorAvanzado';

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
      <UpdateModal />
      <Sidebar versionInfo={versionInfo} />
      <div className="app-main">
        <CaptureBar />
        <main className="app-content">
          <Routes>
            <Route path="/" element={<Navigate to="/biblioteca" replace />} />
            <Route path="/biblioteca" element={<Biblioteca />} />
            <Route path="/editor" element={<Editor />} />
            <Route path="/editor/:clipId" element={<Editor />} />
            <Route path="/editor-avanzado/:clipId" element={<EditorAvanzado />} />
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

/**
 * Botones laterales del ratón: Chromium (Blink) navega el historial atrás/adelante al soltarlos si
 * nadie hizo `preventDefault` del `mouseup`, como un navegador. Es la única vía: el `app-command`
 * de la ventana no navega por sí solo (comprobado con la app real). Se anula siempre porque pueden
 * ser atajos de GameClip (pulsar «Guardar clip» no debe cambiar además de pantalla) y la app no se
 * navega así.
 */
function bloquearNavegacionRaton(e: MouseEvent): void {
  if (isSideMouseButton(e.button)) e.preventDefault();
}

export default function App() {
  useEffect(() => {
    window.addEventListener('mouseup', bloquearNavegacionRaton, true);
    return () => window.removeEventListener('mouseup', bloquearNavegacionRaton, true);
  }, []);

  return (
    <AuthProvider>
      <UpdateProvider>
        <HashRouter>
          <Root />
        </HashRouter>
      </UpdateProvider>
    </AuthProvider>
  );
}
