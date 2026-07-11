import { useEffect, useState } from 'react';
import type { DisplayInfo } from '@shared/capture';

interface Props {
  displays: DisplayInfo[];
  /** Monitor actualmente configurado; preseleccionado si sigue en la lista. */
  selectedIndex: number;
  onClose: () => void;
  onConfirm: (index: number) => void;
}

/** Modal de elección de monitor para grabación de escritorio: preview + nombre por display. */
export default function DisplayPicker({ displays, selectedIndex, onClose, onConfirm }: Props) {
  const [elegido, setElegido] = useState<number | null>(
    displays.some((d) => d.index === selectedIndex) ? selectedIndex : null,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="player-overlay" role="presentation" onClick={onClose}>
      <div
        className="display-picker-panel"
        role="dialog"
        aria-label="Grabar escritorio"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="player-head">
          <h2>Elegí un monitor para grabar</h2>
          <button type="button" aria-label="Cerrar" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="display-picker-grid">
          {displays.map((d) => (
            <button
              key={d.index}
              type="button"
              className={elegido === d.index ? 'display-picker-card active' : 'display-picker-card'}
              onClick={() => setElegido(d.index)}
            >
              <img src={d.thumbnailDataUrl} alt={d.label} />
              <span className="display-picker-name">
                {d.label}
                {d.primary && <span className="display-picker-badge">(principal)</span>}
              </span>
            </button>
          ))}
        </div>
        <div className="display-picker-actions">
          <button type="button" onClick={onClose}>
            Cerrar
          </button>
          <button
            type="button"
            disabled={elegido === null}
            onClick={() => elegido !== null && onConfirm(elegido)}
          >
            Empezar a grabar
          </button>
        </div>
      </div>
    </div>
  );
}
