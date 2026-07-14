import { useRef, type ReactNode } from 'react';
import { clampTime, pxToSeconds, secondsToPx, type Trim } from '@shared/timeline';
import { formatDuration } from '@shared/library';

interface Props {
  duration: number;
  /** Píxeles por segundo. */
  zoom: number;
  playhead: number;
  trim: Trim;
  onSeek: (seconds: number) => void;
  onTrimStart: (seconds: number) => void;
  onTrimEnd: (seconds: number) => void;
  /** Filas de pista (vídeo + audios), que comparten el eje temporal. */
  children: ReactNode;
}

/** Separación deseada entre marcas de la regla, en px: se elige el paso "bonito" más cercano. */
const TICK_TARGET_PX = 80;
const PASOS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

function tickStep(zoom: number): number {
  const objetivo = TICK_TARGET_PX / zoom; // segundos por marca deseados
  return PASOS.find((p) => p >= objetivo) ?? PASOS[PASOS.length - 1];
}

export default function Timeline({
  duration,
  zoom,
  playhead,
  trim,
  onSeek,
  onTrimStart,
  onTrimEnd,
  children,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const width = Math.max(1, secondsToPx(duration, zoom));

  /** clientX del ratón → segundos en el clip (contando el scroll horizontal). */
  function xToSeconds(clientX: number): number {
    const cont = scrollRef.current;
    if (!cont) return 0;
    const rect = cont.getBoundingClientRect();
    const x = clientX - rect.left + cont.scrollLeft;
    return clampTime(pxToSeconds(x, zoom), duration);
  }

  /** Arrastre genérico: captura el puntero y reporta segundos mientras se mueve. */
  function dragging(report: (seconds: number) => void) {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      report(xToSeconds(e.clientX));
      const move = (ev: PointerEvent) => report(xToSeconds(ev.clientX));
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
  }

  const step = tickStep(zoom);
  const ticks: number[] = [];
  for (let t = 0; t <= duration + 0.001; t += step) ticks.push(t);

  const startPx = secondsToPx(trim.start, zoom);
  const endPx = secondsToPx(trim.end, zoom);
  const playPx = secondsToPx(playhead, zoom);

  return (
    <div className="eav-timeline" ref={scrollRef}>
      <div className="eav-timeline-inner" style={{ width }}>
        {/* Regla: click/arrastre para posicionar el playhead. */}
        <div
          className="eav-ruler"
          onPointerDown={dragging(onSeek)}
          role="slider"
          aria-label="Posición de reproducción"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(playhead)}
          tabIndex={0}
        >
          {ticks.map((t) => (
            <span key={t} className="eav-tick" style={{ left: secondsToPx(t, zoom) }}>
              {formatDuration(t)}
            </span>
          ))}
        </div>

        <div className="eav-tracks">{children}</div>

        {/* Zonas atenuadas fuera del recorte. */}
        <div className="eav-trim-shade" style={{ left: 0, width: startPx }} />
        <div className="eav-trim-shade" style={{ left: endPx, width: Math.max(0, width - endPx) }} />

        {/* Asas del recorte. */}
        <div
          className="eav-trim-handle eav-trim-start"
          style={{ left: startPx }}
          onPointerDown={dragging(onTrimStart)}
          role="slider"
          aria-label="Inicio del recorte"
          aria-valuenow={Math.round(trim.start)}
        />
        <div
          className="eav-trim-handle eav-trim-end"
          style={{ left: endPx }}
          onPointerDown={dragging(onTrimEnd)}
          role="slider"
          aria-label="Fin del recorte"
          aria-valuenow={Math.round(trim.end)}
        />

        {/* Playhead. */}
        <div className="eav-playhead" style={{ left: playPx }} />
      </div>
    </div>
  );
}
