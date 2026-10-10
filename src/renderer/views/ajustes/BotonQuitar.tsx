interface BotonQuitarProps {
  /** Qué se quita: da nombre al botón («Quitar Discord.exe»). */
  nombre: string;
  onClick: () => void;
}

/** Botón solo-icono para quitar una fila de una lista de Ajustes (juegos, apps de audio…). */
export function BotonQuitar({ nombre, onClick }: BotonQuitarProps) {
  return (
    <button
      type="button"
      className="settings-remove"
      aria-label={`Quitar ${nombre}`}
      title={`Quitar ${nombre}`}
      onClick={onClick}
    >
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path
          d="M4 4l8 8M12 4l-8 8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
