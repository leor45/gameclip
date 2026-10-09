import { NavLink, Outlet } from 'react-router-dom';

const SECCIONES = [
  { to: 'grabacion', label: 'Grabación' },
  { to: 'general', label: 'General' },
  { to: 'calidad', label: 'Calidad' },
  { to: 'audio', label: 'Audio' },
  { to: 'atajos', label: 'Atajos' },
  { to: 'almacenamiento', label: 'Almacenamiento' },
  { to: 'avanzado', label: 'Avanzado' },
  { to: 'desarrollo', label: 'Desarrollo' },
];

/**
 * Layout de Ajustes: sub-navegación fija a la izquierda y la sección activa en el <Outlet>. La
 * sección ocupa todo el alto: su formulario hace scroll propio y el pie con «Guardar ajustes» queda
 * fijo abajo (ver SeccionForm).
 */
export default function AjustesLayout() {
  return (
    <section className="ajustes">
      <nav className="ajustes-nav" aria-label="Secciones de Ajustes">
        <h1 className="ajustes-title gc-label">Ajustes</h1>
        {SECCIONES.map((seccion) => (
          <NavLink
            key={seccion.to}
            to={seccion.to}
            className={({ isActive }) =>
              isActive ? 'ajustes-nav-link active' : 'ajustes-nav-link'
            }
          >
            {seccion.label}
          </NavLink>
        ))}
      </nav>
      <div className="ajustes-content">
        <Outlet />
      </div>
    </section>
  );
}
