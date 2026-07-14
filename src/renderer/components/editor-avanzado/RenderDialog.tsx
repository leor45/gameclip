import { useState } from 'react';
import type { ExportQuality } from '@shared/export';

interface Props {
  rendering: boolean;
  progress: number;
  error: string | null;
  onRender: (quality: ExportQuality) => void;
  onCancelRender: () => void;
  onClose: () => void;
}

const CALIDADES: { valor: ExportQuality; nombre: string; nota: string }[] = [
  { valor: 'alta', nombre: 'Alta', nota: 'Mejor calidad, archivo más grande' },
  { valor: 'media', nombre: 'Media', nota: 'Equilibrio (recomendado)' },
  { valor: 'baja', nombre: 'Baja', nota: 'Archivo más liviano' },
];

/** Modal de render: elige calidad; al aceptar, el main pide dónde guardar y renderiza a un archivo nuevo. */
export default function RenderDialog({
  rendering,
  progress,
  error,
  onRender,
  onCancelRender,
  onClose,
}: Props) {
  const [calidad, setCalidad] = useState<ExportQuality>('media');

  return (
    <div className="eav-modal-backdrop" onClick={rendering ? undefined : onClose}>
      <div className="eav-modal" role="dialog" aria-label="Renderizar vídeo" onClick={(e) => e.stopPropagation()}>
        <h2>Renderizar vídeo</h2>

        <fieldset className="eav-modal-section" disabled={rendering}>
          <legend>Calidad</legend>
          {CALIDADES.map((c) => (
            <label key={c.valor} className="eav-radio">
              <input
                type="radio"
                name="render-calidad"
                checked={calidad === c.valor}
                onChange={() => setCalidad(c.valor)}
              />
              <span>
                <strong>{c.nombre}</strong>
                <span className="eav-radio-note">{c.nota}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <p className="eav-modal-hint">
          Formato: <strong>MP4 (H.264)</strong>. Al renderizar se te pedirá dónde guardar. El clip
          original no se toca.
        </p>

        {error && <p className="eav-modal-error">{error}</p>}

        {rendering ? (
          <div className="eav-modal-progress">
            <progress aria-label="Progreso del render" max={1} value={progress} />
            <span>{Math.round(progress * 100)} %</span>
            <button type="button" className="eav-btn" onClick={onCancelRender}>
              Cancelar
            </button>
          </div>
        ) : (
          <div className="eav-modal-actions">
            <button type="button" className="eav-btn" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="eav-btn eav-btn-primary" onClick={() => onRender(calidad)}>
              Renderizar vídeo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
