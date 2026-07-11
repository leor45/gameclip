import { NavLink, Outlet } from 'react-router-dom';

const SECCIONES = [
  { to: 'grabacion', label: 'Grabación' },
  { to: 'general', label: 'General' },
  { to: 'calidad', label: 'Calidad' },
  { to: 'audio', label: 'Audio' },
  { to: 'almacenamiento', label: 'Almacenamiento' },
  { to: 'avanzado', label: 'Avanzado' },
  { to: 'desarrollo', label: 'Desarrollo' },
];

/** Layout de Ajustes: título + sub-navegación lateral; cada sección se renderiza en el <Outlet>. */
export default function AjustesLayout() {
  return (
    <section>
      <h1>Ajustes</h1>
      <div className="ajustes-layout">
        <nav className="ajustes-nav">
          {SECCIONES.map((seccion) => (
            <NavLink
              key={seccion.to}
              to={seccion.to}
              className={({ isActive }) => (isActive ? 'ajustes-nav-link active' : 'ajustes-nav-link')}
            >
              {seccion.label}
            </NavLink>
          ))}
        </nav>
        <div className="ajustes-content">
          <Outlet />
        </div>
      </div>
    </section>
  );
}
