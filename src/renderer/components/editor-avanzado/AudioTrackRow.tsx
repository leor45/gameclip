import { useMemo, type CSSProperties } from 'react';
import type { Segment } from '@shared/timeline';
import { MAX_TRACK_GAIN } from '@shared/tracks';
import GameIcon from '../GameIcon';
import Waveform, { waveTone } from './Waveform';

interface HeadProps {
  trackKey: string;
  label: string;
  gain: number;
  removed: boolean;
  onSetGain: (key: string, gain: number) => void;
  onToggleRemove: (key: string) => void;
}

/** Icono de la pista según su rol: juego (mando), PC (escritorio), micrófono o el de la app. */
function IconoPista({ trackKey, label }: { trackKey: string; label: string }) {
  if (trackKey === 'game') return <GameIcon fixed="pad" />;
  if (trackKey === 'pc') return <GameIcon fixed="desktop" />;
  if (trackKey === 'mic') return <GameIcon fixed="mic" />;
  return <GameIcon exe={label} />;
}

/**
 * Cabecera de una pista de audio en la columna izquierda de la timeline: icono, nombre, volumen
 * (0–200 %, siempre visible; por encima de 100 % el número se marca) y quitar/restaurar la pista.
 * La rueda sobre la pista también cambia el volumen (la atiende la timeline).
 */
export function AudioTrackHead({
  trackKey,
  label,
  gain,
  removed,
  onSetGain,
  onToggleRemove,
}: HeadProps) {
  const pct = Math.round(gain * 100);
  return (
    <div className={removed ? 'eav-track-head is-removed' : 'eav-track-head'}>
      <IconoPista trackKey={trackKey} label={label} />
      <div className="eav-track-main">
        <span className="eav-track-name" title={label}>
          {label}
        </span>
        {removed ? (
          <span className="eav-track-removed-note">Pista eliminada — no entra en el render.</span>
        ) : (
          <span className="eav-track-vol">
            <input
              className="eav-track-slider"
              type="range"
              min={0}
              max={MAX_TRACK_GAIN * 100}
              step={5}
              value={pct}
              aria-label={`Volumen de ${label}`}
              style={{ '--v': `${(pct / (MAX_TRACK_GAIN * 100)) * 100}%` } as CSSProperties}
              onChange={(e) => onSetGain(trackKey, Number(e.target.value) / 100)}
            />
            <span className={pct > 100 ? 'eav-track-pct is-loud' : 'eav-track-pct'}>{pct}%</span>
          </span>
        )}
      </div>
      {removed ? (
        <button
          type="button"
          className="eav-track-action"
          aria-label={`Restaurar ${label}`}
          title="Restaurar pista"
          onClick={() => onToggleRemove(trackKey)}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M3 8a5 5 0 1 0 1.5-3.6M3 2.5v3h3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          className="eav-track-action is-remove"
          aria-label={`Eliminar ${label}`}
          title="Quitar la pista del render"
          onClick={() => onToggleRemove(trackKey)}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

/** Onda de UN trozo de una pista: su tramo de origen, escalada por el volumen. */
export function AudioBlock({
  trackKey,
  peaks,
  gain,
  segment,
  duration,
  removed,
}: {
  trackKey: string;
  peaks: number[];
  gain: number;
  segment: Segment;
  duration: number;
  removed: boolean;
}) {
  // Lista estable mientras el tramo no cambie: la onda (un <canvas>) solo se redibuja si cambia algo
  // suyo, no en cada frame de reproducción.
  const tramo = useMemo(
    () => [{ start: segment.start, end: segment.end }],
    [segment.start, segment.end],
  );
  return (
    <Waveform
      tone={waveTone(trackKey)}
      peaks={peaks}
      gain={gain}
      segments={tramo}
      duration={duration}
      dimmed={removed}
    />
  );
}
