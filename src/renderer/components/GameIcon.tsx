import logoUrl from '../assets/logo.svg';
import { useIcon } from '../lib/useIcon';

/**
 * Iconos fijos: no dependen de ningún ejecutable. `desktop` (Escritorio, grabación sin juego),
 * `all` (Todos los juegos), `pad` (Audio del juego) y `mic` (Micrófono).
 */
export type FixedIcon = 'desktop' | 'all' | 'pad' | 'mic';

type Props = {
  size?: 'sm' | 'md' | 'lg';
  /** Texto alternativo; por defecto el icono es decorativo (va junto a su nombre). */
  label?: string;
  className?: string;
} & (
  | { game: string | null; exe?: never; fixed?: never }
  | { exe: string; game?: never; fixed?: never }
  | { fixed: FixedIcon; game?: never; exe?: never }
);

const GLIFOS: Record<FixedIcon, JSX.Element> = {
  desktop: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="8.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 14h6M8 11v3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  all: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z" fill="currentColor" />
    </svg>
  ),
  pad: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M5 4h6a3.5 3.5 0 0 1 3.4 2.7l.8 3.6a1.8 1.8 0 0 1-3.2 1.4L10.6 10H5.4l-1.4 1.7A1.8 1.8 0 0 1 .8 10.3l.8-3.6A3.5 3.5 0 0 1 5 4z"
        fill="currentColor"
      />
    </svg>
  ),
  mic: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" fill="currentColor" />
      <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5M5.5 14.5h5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
};

/**
 * Icono de un juego (por su nombre), de un ejecutable o uno fijo. Mientras carga, o si el juego no
 * tiene icono, se ve el logo de GameClip al mismo tamaño. Con `game` null (sin juego) va el monitor
 * de Escritorio.
 */
export default function GameIcon(props: Props) {
  const { size = 'sm', label, className } = props;
  const fijo: FixedIcon | null = props.fixed ?? (props.game === null ? 'desktop' : null);
  const clave =
    fijo !== null ? null : props.exe !== undefined ? { exe: props.exe } : { game: props.game as string };
  const url = useIcon(clave);
  const clases = ['gc-icon', size === 'sm' ? '' : size, fijo ? 'glyph' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const };

  if (fijo) {
    return (
      <span className={clases} {...a11y} data-icon={fijo}>
        {GLIFOS[fijo]}
      </span>
    );
  }
  return (
    <span className={clases} {...a11y} data-icon={url ? 'app' : 'logo'}>
      <img src={url ?? logoUrl} alt="" draggable={false} />
    </span>
  );
}
