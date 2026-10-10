/** Iconos del editor avanzado: un mismo trazo (1,9 px, puntas redondas) y `currentColor`. */
export type EavIconName =
  | 'camera'
  | 'play'
  | 'pause'
  | 'stop'
  | 'split'
  | 'trash'
  | 'undo'
  | 'redo'
  | 'reset'
  | 'zoomIn'
  | 'zoomOut';

const TRAZOS: Record<EavIconName, JSX.Element> = {
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  play: <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" />,
  split: (
    <>
      <circle cx="6" cy="7" r="2.5" />
      <circle cx="6" cy="17" r="2.5" />
      <path d="M8 8.5 20 16M8 15.5 20 8" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13" />,
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </>
  ),
  redo: (
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </>
  ),
  reset: <path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4" />,
  zoomIn: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.4-4.4M8 11h6M11 8v6" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.4-4.4M8 11h6" />
    </>
  ),
};

export function EavIcon({ name }: { name: EavIconName }) {
  return (
    <svg
      className="eav-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {TRAZOS[name]}
    </svg>
  );
}
