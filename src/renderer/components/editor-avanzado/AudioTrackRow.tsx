import { useEffect, useRef } from 'react';
import { wheelToGain } from '@shared/timeline';
import { MAX_TRACK_GAIN } from '@shared/tracks';
import Waveform from './Waveform';

interface Props {
  trackKey: string;
  label: string;
  gain: number;
  peaks: number[];
  removed: boolean;
  onSetGain: (key: string, gain: number) => void;
  onToggleRemove: (key: string) => void;
}

/** Icono de basurero (mismo trazo que el resto de la app). */
function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 1h4l.5 1H14v2H2V2h3.5L6 1zm-2.5 4h9L12 15H4L3.5 5zm3 2v6h1V7h-1zm2.5 0v6h1V7h-1z"
      />
    </svg>
  );
}

/**
 * Una pista de audio del timeline. La cabecera (nombre, volumen y basurero) va **fija a la
 * izquierda** (`sticky`): no la toca el recorte ni el sombreado, así que los controles se ven
 * siempre nítidos. El espectro va a lo ancho y sí se sombrea fuera del recorte. El volumen se ajusta
 * con la **rueda** sobre el espectro y con el slider de la cabecera.
 */
export default function AudioTrackRow({
  trackKey,
  label,
  gain,
  peaks,
  removed,
  onSetGain,
  onToggleRemove,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  // La rueda se lee de un listener nativo no-pasivo (React los registra pasivos y no deja
  // preventDefault). Un ref al gain actual evita re-suscribir en cada cambio.
  const gainRef = useRef(gain);
  gainRef.current = gain;

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || removed) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      onSetGain(trackKey, wheelToGain(gainRef.current, e.deltaY));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [trackKey, removed, onSetGain]);

  const pct = Math.round(gain * 100);

  return (
    <li className={removed ? 'eav-track is-removed' : 'eav-track'}>
      <div className="eav-track-head">
        <span className="eav-track-name" title={label}>
          {label}
        </span>
        {removed ? (
          <button
            type="button"
            className="eav-track-restore"
            aria-label={`Restaurar ${label}`}
            title="Restaurar pista"
            onClick={() => onToggleRemove(trackKey)}
          >
            ↺
          </button>
        ) : (
          <>
            <input
              className="eav-track-slider"
              type="range"
              min={0}
              max={MAX_TRACK_GAIN * 100}
              step={5}
              value={pct}
              aria-label={`Volumen de ${label}`}
              onChange={(e) => onSetGain(trackKey, Number(e.target.value) / 100)}
            />
            <span className="eav-track-pct">{pct}%</span>
            <button
              type="button"
              className="eav-track-trash"
              aria-label={`Eliminar ${label}`}
              title="Eliminar pista"
              onClick={() => onToggleRemove(trackKey)}
            >
              <TrashIcon />
            </button>
          </>
        )}
      </div>

      <div className="eav-track-body" ref={bodyRef}>
        {removed ? (
          <p className="eav-track-removed-note">Pista eliminada — no entra en el render.</p>
        ) : (
          <Waveform peaks={peaks} gain={gain} />
        )}
      </div>
    </li>
  );
}
