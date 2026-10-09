import { useState } from 'react';
import type { DisplayInfo } from '@shared/capture';
import Modal from './Modal';

interface Props {
  displays: DisplayInfo[];
  /** Monitor actualmente configurado; preseleccionado si sigue en la lista. */
  selectedIndex: number;
  onClose: () => void;
  onConfirm: (index: number) => void;
}

/**
 * Modal de elección de monitor para grabación de escritorio: preview + nombre por display. Esc, clic
 * fuera o «Cerrar» lo cierran sin grabar.
 */
export default function DisplayPicker({ displays, selectedIndex, onClose, onConfirm }: Props) {
  const [elegido, setElegido] = useState<number | null>(
    displays.some((d) => d.index === selectedIndex) ? selectedIndex : null,
  );

  return (
    <Modal
      title="Elegí un monitor para grabar"
      className="display-picker"
      onDismiss={onClose}
      actions={
        <>
          <button type="button" className="gc-btn ghost" onClick={onClose}>
            Cerrar
          </button>
          <button
            type="button"
            className="gc-btn"
            disabled={elegido === null}
            onClick={() => elegido !== null && onConfirm(elegido)}
          >
            Empezar a grabar
          </button>
        </>
      }
    >
      <div className="display-picker-grid">
        {displays.map((d) => (
          <button
            key={d.index}
            type="button"
            className={elegido === d.index ? 'display-picker-card active' : 'display-picker-card'}
            aria-pressed={elegido === d.index}
            data-autofocus={elegido === d.index ? '' : undefined}
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
    </Modal>
  );
}
