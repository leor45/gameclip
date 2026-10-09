import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { LibraryGameStats } from '@shared/ipc';
import { DESKTOP_FILTER_VALUE } from '@shared/library';
import GameIcon from '../GameIcon';

interface Props {
  /** '' = todos, `DESKTOP_FILTER_VALUE` = escritorio, o el nombre del juego. */
  value: string;
  onChange: (value: string) => void;
  /** Contadores del catálogo; null mientras cargan. */
  stats: LibraryGameStats | null;
}

interface Opcion {
  value: string;
  label: string;
  count: number | null;
  /** Arranca la sección «Juegos capturados». */
  primerJuego?: boolean;
}

/** Comparación sin mayúsculas ni tildes: «pokemon» encuentra «Pokémon». */
function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function Icono({ value }: { value: string }) {
  if (value === '') return <GameIcon fixed="all" />;
  if (value === DESKTOP_FILTER_VALUE) return <GameIcon game={null} />;
  return <GameIcon game={value} />;
}

/**
 * Filtro de juego de la Biblioteca (sustituye al `<select>`): botón con el juego elegido y un
 * desplegable `listbox` con buscador, «Todos los juegos», «Escritorio» y los juegos capturados con
 * su número de clips, de más a menos. El foco se queda en el buscador y la opción activa se marca
 * con `aria-activedescendant`: ↑ ↓ mueven, Intro elige, Esc cierra y devuelve el foco al botón.
 */
export default function GameFilter({ value, onChange, stats }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [activa, setActiva] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const idLista = useId();

  const opciones = useMemo<Opcion[]>(() => {
    const juegos = stats?.games ?? [];
    return [
      { value: '', label: 'Todos los juegos', count: stats?.total ?? null },
      { value: DESKTOP_FILTER_VALUE, label: 'Escritorio', count: stats?.desktop ?? null },
      ...juegos.map((g, i) => ({ value: g.name, label: g.name, count: g.count, primerJuego: i === 0 })),
    ];
  }, [stats]);

  const visibles = useMemo(() => {
    const q = normalizar(consulta.trim());
    if (!q) return opciones;
    const filtradas = opciones.filter((o) => normalizar(o.label).includes(q));
    // La etiqueta «Juegos capturados» va delante del primer juego que quede a la vista.
    const primero = filtradas.findIndex((o) => o.value !== '' && o.value !== DESKTOP_FILTER_VALUE);
    return filtradas.map((o, i) => ({ ...o, primerJuego: i === primero }));
  }, [opciones, consulta]);

  // Clic fuera cierra (sin robar el foco: el usuario ya está en otro sitio).
  useEffect(() => {
    if (!abierto) return;
    const onDown = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [abierto]);

  useEffect(() => {
    if (abierto) buscador.current?.focus();
  }, [abierto]);

  function abrir() {
    setConsulta('');
    const i = opciones.findIndex((o) => o.value === value);
    setActiva(i >= 0 ? i : 0);
    setAbierto(true);
  }

  function cerrar(devolverFoco: boolean) {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  }

  function elegir(o: Opcion) {
    onChange(o.value);
    cerrar(true);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Las teclas del desplegable no llegan a los atajos de la vista (↑ ↓ / Intro / Esc del panel).
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      if (visibles.length === 0) return;
      const paso = e.key === 'ArrowDown' ? 1 : -1;
      setActiva((a) => (Math.min(a, visibles.length - 1) + paso + visibles.length) % visibles.length);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      setActiva(e.key === 'Home' ? 0 : Math.max(0, visibles.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const o = visibles[Math.min(activa, visibles.length - 1)];
      if (o) elegir(o);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cerrar(true);
    } else if (e.key === 'Tab') {
      cerrar(false);
    }
  }

  const actual = opciones.find((o) => o.value === value);
  const etiqueta = actual?.label ?? value;
  const activaVisible = Math.min(activa, visibles.length - 1);
  const idOpcion = (i: number) => `${idLista}-op-${i}`;

  return (
    <div className="game-filter" ref={raiz}>
      <button
        ref={boton}
        type="button"
        className={value ? 'game-filter-btn on' : 'game-filter-btn'}
        aria-label={`Filtrar por juego: ${etiqueta}`}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => (abierto ? cerrar(false) : abrir())}
        // ↑ ↓ sobre el botón cerrado abren el desplegable (y no cambian el clip del panel).
        onKeyDown={(e) => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          e.preventDefault();
          e.stopPropagation();
          if (!abierto) abrir();
        }}
      >
        <Icono value={value} />
        <span className="game-filter-name">{etiqueta}</span>
        <i className="game-filter-chev" aria-hidden="true" />
      </button>

      {abierto && (
        <div className="game-filter-menu">
          <input
            ref={buscador}
            className="gc-field game-filter-search"
            type="text"
            role="combobox"
            aria-label="Buscar juego"
            aria-controls={idLista}
            aria-expanded="true"
            aria-autocomplete="list"
            aria-activedescendant={activaVisible >= 0 ? idOpcion(activaVisible) : undefined}
            placeholder="Buscar juego…"
            value={consulta}
            onChange={(e) => {
              setConsulta(e.target.value);
              setActiva(0);
            }}
            onKeyDown={onKeyDown}
          />
          <ul id={idLista} role="listbox" aria-label="Filtrar por juego">
            {visibles.map((o, i) => (
              <li key={o.value || '__todos__'} role="none" className="game-filter-item">
                {o.primerJuego && (
                  <div className="game-filter-sep" aria-hidden="true">
                    <span className="gc-label">Juegos capturados</span>
                  </div>
                )}
                <div
                  id={idOpcion(i)}
                  role="option"
                  aria-selected={o.value === value}
                  className={[
                    'game-filter-opt',
                    o.value === value ? 'on' : '',
                    i === activaVisible ? 'active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  // mousedown: el clic no debe quitar el foco al buscador antes de elegir.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiva(i)}
                  onClick={() => elegir(o)}
                >
                  <Icono value={o.value} />
                  <span className="game-filter-label">{o.label}</span>
                  <span className="game-filter-count">{o.count ?? ''}</span>
                </div>
              </li>
            ))}
            {visibles.length === 0 && (
              <li role="none" className="game-filter-empty">
                Ningún juego coincide.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
