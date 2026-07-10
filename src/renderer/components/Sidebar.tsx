import { NavLink } from 'react-router-dom';
import type { AppVersionInfo } from '@shared/ipc';

const links = [
  { to: '/biblioteca', label: 'Biblioteca' },
  { to: '/editor', label: 'Editor' },
  { to: '/ajustes', label: 'Ajustes' },
];

interface SidebarProps {
  versionInfo: AppVersionInfo | null;
}

export default function Sidebar({ versionInfo }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">GameClip</div>
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
      <footer className="sidebar-footer">
        {versionInfo ? `v${versionInfo.version} · Electron ${versionInfo.electron}` : '…'}
      </footer>
    </aside>
  );
}
