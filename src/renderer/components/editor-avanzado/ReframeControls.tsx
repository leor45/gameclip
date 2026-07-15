import {
  clampZoom,
  DEFAULT_REFRAME,
  hasReframe,
  MAX_ZOOM,
  MIN_ZOOM,
  type AspectKey,
  type Reframe,
} from '@shared/reframe';

const ASPECT_OPTIONS: { key: AspectKey; label: string }[] = [
  { key: 'original', label: 'Original' },
  { key: '16:9', label: '16:9' },
  { key: '9:16', label: '9:16' },
  { key: '1:1', label: '1:1' },
  { key: '4:5', label: '4:5' },
];

interface Props {
  reframe: Reframe;
  onChange: (reframe: Reframe) => void;
}

/**
 * Controles de reencuadre (Fase 4): relación de aspecto de salida, modo de encaje (recorte/barras),
 * zoom y centrar. Con `original` no reencuadra y el resto se deshabilita. El estado vive en el editor
 * y la previa lo refleja al instante (previa = render).
 */
export default function ReframeControls({ reframe, onChange }: Props) {
  const active = hasReframe(reframe);
  const isCover = reframe.mode === 'cover';

  function setAspect(aspect: AspectKey) {
    if (aspect === 'original') {
      onChange({ ...DEFAULT_REFRAME });
    } else {
      // Al cambiar de aspecto se recentra el encuadre (el margen disponible cambia).
      onChange({ ...reframe, aspect, offset: { x: 0, y: 0 } });
    }
  }

  return (
    <div className="eav-reframe" role="group" aria-label="Relación de aspecto y encuadre">
      <div className="eav-reframe-aspects">
        {ASPECT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className={`eav-chip${reframe.aspect === opt.key ? ' is-active' : ''}`}
            aria-pressed={reframe.aspect === opt.key}
            onClick={() => setAspect(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {active && (
        <div className="eav-reframe-fit">
          <button
            type="button"
            className={`eav-chip${isCover ? ' is-active' : ''}`}
            aria-pressed={isCover}
            onClick={() => onChange({ ...reframe, mode: 'cover' })}
            title="Recorta para llenar el marco (reposicionable)"
          >
            Recorte
          </button>
          <button
            type="button"
            className={`eav-chip${!isCover ? ' is-active' : ''}`}
            aria-pressed={!isCover}
            onClick={() => onChange({ ...reframe, mode: 'contain' })}
            title="Imagen entera con barras negras"
          >
            Barras
          </button>

          {isCover && (
            <label className="eav-reframe-zoom" title="Zoom del encuadre">
              🔍
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.05}
                value={reframe.zoom}
                aria-label="Zoom"
                onChange={(e) => onChange({ ...reframe, zoom: clampZoom(Number(e.target.value)) })}
              />
              <button
                type="button"
                className="eav-chip"
                onClick={() => onChange({ ...reframe, zoom: MIN_ZOOM, offset: { x: 0, y: 0 } })}
                title="Centrar y restablecer el zoom"
              >
                Centrar
              </button>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
