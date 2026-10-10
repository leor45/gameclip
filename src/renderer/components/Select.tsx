import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  /** Segunda línea, más tenue (p. ej. el título de la ventana de un proceso). */
  detail?: string;
  /** Icono a la izquierda (también se muestra en el campo cuando es la opción elegida). */
  icon?: ReactNode;
  disabled?: boolean;
}

interface Props<T extends string | number> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** Texto del campo cuando el valor no es ninguna opción (p. ej. «Elegir…»). */
  placeholder?: string;
  disabled?: boolean;
  /** Buscador dentro de la lista; por defecto, solo con más de `BUSCADOR_DESDE` opciones. */
  searchable?: boolean;
  /** Nombre accesible si no hay un `<label>` que lo envuelva. */
  'aria-label'?: string;
  className?: string;
}

/** A partir de cuántas opciones la lista lleva buscador. */
export const BUSCADOR_DESDE = 9;

/** Margen entre el campo y la lista, y con el borde de la ventana (px). */
const HUECO = 6;
/** Alto máximo de la lista (px); si no cabe debajo del campo, se abre hacia arriba. */
const ALTO_MAX = 320;

/**
 * Desplegable propio (sustituye al `<select>` nativo, cuya lista dibuja Windows y no se puede estilar),
 * con el aspecto del filtro de juegos de la Biblioteca: la opción elegida con su marca amarilla, iconos
 * opcionales y una segunda línea por opción.
 *
 * Mismo contrato que un `<select>` controlado: `value` + `onChange` con el valor de la opción. El campo
 * es un `<button role="combobox">`: dentro de un `<label>` toma de él su nombre y el clic en el texto
 * lo abre, como el nativo.
 *
 * Teclado: con el campo enfocado, ↓ ↑ Intro o Espacio abren; abierto, ↑ ↓ Inicio Fin recorren (saltando
 * las desactivadas), Intro elige, Esc cierra sin cambiar y Tab cierra. Escribir salta a la primera
 * opción que empieza así (o filtra, si hay buscador).
 *
 * La lista se pinta en un portal con posición fija: los formularios de Ajustes tienen scroll propio y
 * la recortarían.
 */
export default function Select<T extends string | number>({
  value,
  options,
  onChange,
  placeholder = 'Elegir…',
  disabled = false,
  searchable,
  className,
  'aria-label': ariaLabel,
}: Props<T>) {
  const id = useId();
  const listId = `${id}-lista`;
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const buscadorRef = useRef<HTMLInputElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(0);
  const [consulta, setConsulta] = useState('');
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number }>({
    left: 0,
    width: 0,
  });
  const tecleo = useRef<{ texto: string; hasta: number }>({ texto: '', hasta: 0 });
  const conBuscador = searchable ?? options.length >= BUSCADOR_DESDE;

  const elegida = options.find((o) => o.value === value) ?? null;
  const visibles = useMemo(() => {
    const q = consulta.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => `${o.label} ${o.detail ?? ''}`.toLowerCase().includes(q));
  }, [options, consulta]);

  // ── Posición de la lista (bajo el campo; encima si no cabe) ──
  const colocar = useCallback(() => {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 240);
    const left = Math.max(HUECO, Math.min(r.left, window.innerWidth - width - HUECO));
    const abajo = window.innerHeight - r.bottom - HUECO * 2;
    const arriba = r.top - HUECO * 2;
    if (abajo < Math.min(ALTO_MAX, 200) && arriba > abajo) {
      setPos({ left, width, bottom: window.innerHeight - r.top + HUECO });
    } else {
      setPos({ left, width, top: r.bottom + HUECO });
    }
  }, []);

  useLayoutEffect(() => {
    if (!abierto) return;
    colocar();
    const alMover = (e: Event) => {
      // El scroll de la propia lista no la recoloca.
      if (e.target instanceof Node && menu.current?.contains(e.target)) return;
      colocar();
    };
    window.addEventListener('resize', colocar);
    window.addEventListener('scroll', alMover, true);
    return () => {
      window.removeEventListener('resize', colocar);
      window.removeEventListener('scroll', alMover, true);
    };
  }, [abierto, colocar]);

  // Clic fuera: cierra. El foco vuelve solo si estaba dentro.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (boton.current?.contains(t) || menu.current?.contains(t)) return;
      cerrar(false);
    };
    document.addEventListener('pointerdown', fuera, true);
    return () => document.removeEventListener('pointerdown', fuera, true);
  }, [abierto]);

  // Desactivado con la lista abierta (p. ej. se apaga el interruptor del que depende): se cierra.
  useEffect(() => {
    if (disabled && abierto) setAbierto(false);
  }, [disabled, abierto]);

  useEffect(() => {
    if (abierto && conBuscador) buscadorRef.current?.focus();
  }, [abierto, conBuscador]);

  // La activa siempre a la vista dentro de la lista (sin mover la página).
  useLayoutEffect(() => {
    if (!abierto) return;
    const lista = menu.current?.querySelector<HTMLElement>('[role="listbox"]');
    const el = lista?.querySelector<HTMLElement>(`[data-index="${activa}"]`);
    if (!lista || !el) return;
    if (el.offsetTop < lista.scrollTop) lista.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > lista.scrollTop + lista.clientHeight) {
      lista.scrollTop = el.offsetTop + el.offsetHeight - lista.clientHeight;
    }
  }, [abierto, activa, visibles]);

  function abrir() {
    if (disabled) return;
    setConsulta('');
    const i = options.findIndex((o) => o.value === value && !o.disabled);
    setActiva(i >= 0 ? i : primeraHabilitada(options, 0, 1));
    setAbierto(true);
  }

  function cerrar(devolverFoco = true) {
    setAbierto(false);
    setConsulta('');
    if (devolverFoco) boton.current?.focus();
  }

  function elegir(o: SelectOption<T> | undefined) {
    if (!o || o.disabled) return;
    cerrar();
    if (o.value !== value) onChange(o.value);
  }

  function mover(desde: number, paso: 1 | -1) {
    const i = primeraHabilitada(visibles, desde, paso);
    if (i >= 0) setActiva(i);
  }

  function onKeyAbierto(e: ReactKeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        mover(activa + 1, 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        mover(activa - 1, -1);
        break;
      case 'Home':
        if (conBuscador && e.target === buscadorRef.current) return;
        e.preventDefault();
        mover(0, 1);
        break;
      case 'End':
        if (conBuscador && e.target === buscadorRef.current) return;
        e.preventDefault();
        mover(visibles.length - 1, -1);
        break;
      case 'Enter':
        e.preventDefault();
        elegir(visibles[activa]);
        break;
      case 'Escape':
        // Esc es de la lista: ni cierra la vista ni llega a otros atajos.
        e.preventDefault();
        e.stopPropagation();
        cerrar();
        break;
      case 'Tab':
        // La lista vive al final del documento: desde el buscador, Tab saltaría allí. Vuelve al campo.
        if (e.target === buscadorRef.current) {
          e.preventDefault();
          cerrar();
        } else {
          cerrar(false);
        }
        break;
      default:
        if (!conBuscador && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
          saltarA(e.key);
        }
    }
  }

  /** Escribir sin buscador: salta a la primera opción que empieza por lo tecleado. */
  function saltarA(letra: string) {
    const ahora = Date.now();
    const t = tecleo.current;
    t.texto = ahora < t.hasta ? t.texto + letra.toLowerCase() : letra.toLowerCase();
    t.hasta = ahora + 700;
    const i = visibles.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(t.texto));
    if (i >= 0) setActiva(i);
  }

  function onKeyBoton(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (abierto) {
      onKeyAbierto(e);
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      abrir();
    }
  }

  const clases = ['gc-select'];
  if (className) clases.push(className);
  const activaId = abierto && visibles[activa] ? `${id}-op-${activa}` : undefined;

  return (
    <>
      <button
        ref={boton}
        type="button"
        className={clases.join(' ')}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? listId : undefined}
        aria-activedescendant={conBuscador ? undefined : activaId}
        aria-label={ariaLabel}
        data-value={String(value)}
        disabled={disabled}
        onClick={() => (abierto ? cerrar() : abrir())}
        onKeyDown={onKeyBoton}
      >
        {elegida?.icon && <span className="gc-select-icon">{elegida.icon}</span>}
        <span className={elegida ? 'gc-select-value' : 'gc-select-value is-placeholder'}>
          {elegida ? (
            <>
              <span className="gc-select-label">{elegida.label}</span>
              {elegida.detail && <span className="gc-select-detail">{elegida.detail}</span>}
            </>
          ) : (
            placeholder
          )}
        </span>
        <svg className="gc-select-chev" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="m4 6 4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {abierto &&
        createPortal(
          <div
            ref={menu}
            className="gc-select-menu"
            style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
          >
            {conBuscador && (
              <label className="gc-select-search">
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <circle
                    cx="7"
                    cy="7"
                    r="4.6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M10.4 10.4 14 14"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
                <input
                  ref={buscadorRef}
                  type="text"
                  role="combobox"
                  aria-label="Buscar"
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-activedescendant={activaId}
                  aria-autocomplete="list"
                  placeholder="Buscar…"
                  value={consulta}
                  onChange={(e) => {
                    setConsulta(e.target.value);
                    setActiva(0);
                  }}
                  onKeyDown={onKeyAbierto}
                />
              </label>
            )}
            <div className="gc-select-list" role="listbox" id={listId}>
              {visibles.map((o, i) => (
                <div
                  key={String(o.value)}
                  id={`${id}-op-${i}`}
                  data-index={i}
                  data-value={String(o.value)}
                  role="option"
                  aria-selected={o.value === value}
                  aria-disabled={o.disabled || undefined}
                  className={[
                    'gc-select-option',
                    i === activa ? 'is-active' : '',
                    o.disabled ? 'is-disabled' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onPointerMove={() => !o.disabled && i !== activa && setActiva(i)}
                  onClick={() => elegir(o)}
                >
                  <svg className="gc-select-check" viewBox="0 0 16 16" aria-hidden="true">
                    <path
                      d="m3.5 8.5 3 3 6-7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {o.icon && <span className="gc-select-icon">{o.icon}</span>}
                  <span className="gc-select-text">
                    <span className="gc-select-label">{o.label}</span>
                    {o.detail && <span className="gc-select-detail">{o.detail}</span>}
                  </span>
                </div>
              ))}
              {visibles.length === 0 && <p className="gc-select-empty">Sin resultados</p>}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Índice de la primera opción habilitada desde `desde` en la dirección `paso`; −1 si no hay. */
function primeraHabilitada<T extends string | number>(
  opciones: SelectOption<T>[],
  desde: number,
  paso: 1 | -1,
): number {
  for (let i = desde; i >= 0 && i < opciones.length; i += paso) {
    if (!opciones[i].disabled) return i;
  }
  return -1;
}
