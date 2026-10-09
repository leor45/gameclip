import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Duraciones del clip retroactivo, dentro de los límites que ya valida el dominio (10–300 s): ningún
 * valor del control puede ser rechazado por la normalización. El valor fino sigue en Ajustes.
 */
export const DURACIONES: { seconds: number; label: string }[] = [
  { seconds: 30, label: '30 s' },
  { seconds: 60, label: '1 m' },
  { seconds: 120, label: '2 m' },
  { seconds: 180, label: '3 m' },
  { seconds: 300, label: '5 m' },
];

/** Etiqueta corta de una duración: la del preset si lo es, o los segundos tal cual. */
export function etiquetaDuracion(seconds: number): string {
  return DURACIONES.find((d) => d.seconds === seconds)?.label ?? `${seconds} s`;
}

interface DurationMenuProps {
  /** Duración configurada (`settings.replaySeconds`). */
  seconds: number;
  disabled: boolean;
  /** Aplica la duración elegida (el padre llama a `setSettings`). */
  onSelect: (seconds: number) => Promise<void>;
  /** `split`: parte derecha del botón dividido · `solo`: botón suelto (cuando no hay «Guardar clip»). */
  variant: 'split' | 'solo';
}

/**
 * Menú de duración del clip: sustituye al `<select>` nativo (que no se puede estilar). Botón con
 * `aria-haspopup="listbox"` y lista de opciones; ↑ ↓ mueven, Intro/Espacio eligen, Esc cierra y
 * devuelve el foco al botón, y un clic fuera cierra. El pie lleva a Ajustes → General, donde se
 * escribe el valor exacto.
 */
export default function DurationMenu({ seconds, disabled, onSelect, variant }: DurationMenuProps) {
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const id = useId();

  // El valor guardado puede no ser un preset (Ajustes admite cualquiera): se muestra el primero.
  const opciones = DURACIONES.some((d) => d.seconds === seconds)
    ? DURACIONES
    : [{ seconds, label: `${seconds} s` }, ...DURACIONES];

  function abrir() {
    setActiva(Math.max(0, opciones.findIndex((o) => o.seconds === seconds)));
    setAbierto(true);
  }

  function cerrar(devolverFoco: boolean) {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  }

  // Al abrir, el foco pasa a la lista para que las flechas funcionen.
  useEffect(() => {
    if (abierto) lista.current?.focus();
  }, [abierto]);

  // Clic fuera cierra (sin robar el foco a lo que se pulsó).
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  async function elegir(valor: number) {
    cerrar(true);
    await onSelect(valor);
    // Mientras se aplica el botón está desactivado y pierde el foco: se recupera al terminar.
    if (document.activeElement === document.body) boton.current?.focus();
  }

  function teclasBoton(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      abrir();
    }
  }

  function teclasLista(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiva((i) => (i + 1) % opciones.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiva((i) => (i - 1 + opciones.length) % opciones.length);
        break;
      case 'Home':
        e.preventDefault();
        setActiva(0);
        break;
      case 'End':
        e.preventDefault();
        setActiva(opciones.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        void elegir(opciones[activa].seconds);
        break;
    }
  }

  // Esc cierra desde cualquier punto del menú (lista o pie).
  function teclasMenu(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cerrar(true);
    }
  }

  return (
    <div
      ref={raiz}
      className={`cap-dur cap-dur-${variant}`}
      onBlur={(e) => {
        // Tab fuera del menú lo cierra.
        if (abierto && !raiz.current?.contains(e.relatedTarget as Node | null)) setAbierto(false);
      }}
    >
      <button
        ref={boton}
        type="button"
        className={`cap-dur-btn${abierto ? ' is-open' : ''}`}
        aria-label="Duración del clip"
        title="Duración del clip"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        disabled={disabled}
        onClick={() => (abierto ? cerrar(false) : abrir())}
        onKeyDown={teclasBoton}
      >
        <span className="cap-dur-valor">{etiquetaDuracion(seconds)}</span>
        <span className="cap-chev" aria-hidden="true" />
      </button>

      {abierto && (
        <div className="cap-menu" onKeyDown={teclasMenu}>
          <div className="gc-label cap-menu-title" id={`${id}-t`}>
            Duración del clip
          </div>
          <ul
            ref={lista}
            className="cap-menu-list"
            role="listbox"
            aria-labelledby={`${id}-t`}
            aria-activedescendant={`${id}-o${activa}`}
            tabIndex={-1}
            onKeyDown={teclasLista}
          >
            {opciones.map((o, i) => (
              <li
                key={o.seconds}
                id={`${id}-o${i}`}
                role="option"
                aria-selected={o.seconds === seconds}
                className={`cap-opt${i === activa ? ' is-active' : ''}${o.seconds === seconds ? ' is-current' : ''}`}
                onMouseEnter={() => setActiva(i)}
                onClick={() => void elegir(o.seconds)}
              >
                <span>{o.label}</span>
                <span className="cap-opt-check" aria-hidden="true">
                  {o.seconds === seconds ? '✓' : ''}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="cap-menu-foot"
            onClick={() => {
              setAbierto(false);
              navigate('/ajustes/general', { state: { focus: 'replaySeconds' } });
            }}
          >
            <span>Otro valor exacto</span>
            <b>Ajustes → General ›</b>
          </button>
        </div>
      )}
    </div>
  );
}
