import { NavLink } from 'react-router-dom';
import type { AppVersionInfo } from '@shared/ipc';
import logoUrl from '../assets/logo.svg';
import { useAuth } from '../auth/AuthContext';
import { useUpdates } from '../updates/UpdateContext';
import StorageIndicator from './StorageIndicator';

const links = [
  { to: '/biblioteca', label: 'Biblioteca' },
  { to: '/editor', label: 'Editor' },
  { to: '/ajustes', label: 'Ajustes' },
];

interface SidebarProps {
  versionInfo: AppVersionInfo | null;
}

export default function Sidebar({ versionInfo }: SidebarProps) {
  const { session, logout } = useAuth();
  const { result, comprobando, comprobadoManual, comprobar } = useUpdates();
  const hayUpdate = result?.updateAvailable ?? false;

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src={logoUrl} alt="" draggable={false} />
        <span className="gc-display">GameClip</span>
      </div>
      <nav className="sidebar-nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-updates">
        {hayUpdate && result?.latest && (
          <button
            type="button"
            className="update-notice"
            onClick={() => window.open(result.url)}
          >
            ⬆ Actualización disponible: v{result.latest}
          </button>
        )}
        <button
          type="button"
          className={`update-check${comprobando ? ' is-busy' : ''}`}
          onClick={() => void comprobar()}
          disabled={comprobando}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M13.5 8a5.5 5.5 0 1 1-1.7-3.97M13.5 2.5v3h-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {comprobando ? 'Comprobando…' : 'Comprobar actualizaciones'}
        </button>
        {comprobadoManual && !hayUpdate && !comprobando && (
          <span className="update-uptodate">Estás al día ✓</span>
        )}
      </div>
      <StorageIndicator />
      {session && (
        <div className="sidebar-user">
          <span className="sidebar-user-name">{session.user.displayName}</span>
          <button type="button" className="sidebar-logout" onClick={() => void logout()}>
            Cerrar sesión
          </button>
        </div>
      )}
      <footer className="sidebar-footer">
        {versionInfo ? `v${versionInfo.version} · Electron ${versionInfo.electron}` : '…'}
      </footer>
    </aside>
  );
}
