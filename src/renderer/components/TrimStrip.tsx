import type { CSSProperties } from 'react';
import { formatDuration } from '@shared/library';
import Filmstrip from './editor-avanzado/Filmstrip';

interface Props {
  clipId: number;
  /** Duración del clip (s). */
  duracion: number;
  inicio: number;
  fin: number;
  /** Posición actual del reproductor (s), para la línea de reproducción. */
  actual: number;
  /** Paso de las asas con el teclado (s). */
  paso: number;
  disabled?: boolean;
  /** Valor pedido por el asa; quien monta aplica las reglas (mínimo de recorte, límites). */
  onInicio: (valor: number) => void;
  onFin: (valor: number) => void;
}

/** Marcas de tiempo bajo la tira: inicio, cuartos y final. */
const MARCAS = [0, 0.25, 0.5, 0.75, 1];

/**
 * Recorte del editor básico sobre una tira de fotogramas: dos asas amarillas (inicio y fin), lo de fuera
 * oscurecido y la línea de reproducción. Las asas son los mismos `<input type="range">` de siempre
 * (mismo valor, mismo evento, teclado nativo), superpuestos a la tira: solo sus asas reciben el ratón.
 * Los fotogramas son los del editor avanzado (misma extracción y caché); si no hay, la tira queda lisa.
 */
export default function TrimStrip({
  clipId,
  duracion,
  inicio,
  fin,
  actual,
  paso,
  disabled = false,
  onInicio,
  onFin,
}: Props) {
  const total = duracion > 0 ? duracion : 1;
  const estilo = {
    '--trim-a': String(Math.max(0, Math.min(1, inicio / total))),
    '--trim-b': String(Math.max(0, Math.min(1, fin / total))),
    '--trim-t': String(Math.max(0, Math.min(1, actual / total))),
  } as CSSProperties;
  // Con el inicio pasada la mitad, su asa va encima: si las dos asas se tocan, la que está más cerca
  // del borde libre sigue siendo alcanzable con el ratón.
  const inicioEncima = inicio > total / 2;

  return (
    <div className={disabled ? 'trim-strip is-disabled' : 'trim-strip'} style={estilo}>
      <div className="trim-strip-film">
        <Filmstrip clipId={clipId} segments={[{ start: 0, end: duracion }]} duration={duracion} />
        <div className="trim-strip-out is-left" />
        <div className="trim-strip-out is-right" />
        <div className="trim-strip-sel" />
        <div className="trim-strip-playhead" />
      </div>
      <input
        type="range"
        className={inicioEncima ? 'trim-strip-handle is-top' : 'trim-strip-handle'}
        min={0}
        max={duracion}
        step={paso}
        value={inicio}
        disabled={disabled}
        aria-label="Inicio del recorte"
        aria-valuetext={formatDuration(inicio)}
        onChange={(e) => onInicio(Number(e.target.value))}
      />
      <input
        type="range"
        className={inicioEncima ? 'trim-strip-handle' : 'trim-strip-handle is-top'}
        min={0}
        max={duracion}
        step={paso}
        value={fin}
        disabled={disabled}
        aria-label="Fin del recorte"
        aria-valuetext={formatDuration(fin)}
        onChange={(e) => onFin(Number(e.target.value))}
      />
      <div className="trim-strip-ticks" aria-hidden="true">
        {MARCAS.map((m) => (
          <span key={m}>{formatDuration(m * duracion)}</span>
        ))}
      </div>
    </div>
  );
}
