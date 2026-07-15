import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  clampTime,
  pxToSeconds,
  secondsToPx,
  timelinePxPerSecond,
  type Trim,
} from '@shared/timeline';
import { formatDuration } from '@shared/library';

interface Props {
  duration: number;
  /** Factor de zoom (1× = el clip llena el ancho; más = scroll). */
  zoomFactor: number;
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

function tickStep(pxPerSecond: number): number {
  const objetivo = TICK_TARGET_PX / pxPerSecond; // segundos por marca deseados
  return PASOS.find((p) => p >= objetivo) ?? PASOS[PASOS.length - 1];
}

export default function Timeline({
  duration,
  zoomFactor,
  playhead,
  trim,
  onSeek,
  onTrimStart,
  onTrimEnd,
  children,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Mide el ancho visible del timeline para poder "ajustar" clips cortos a todo el ancho.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const medir = () => setContainerWidth(el.clientWidth);
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // px/segundo efectivos: "fit" al ancho × factor de zoom. Regla, pistas, playhead y asas comparten
  // esta escala, así que siempre alinean (clip corto llena el ancho; con más factor, scroll).
  const pps = timelinePxPerSecond(zoomFactor, containerWidth, duration);
  const width = Math.max(1, secondsToPx(duration, pps));

  /** clientX del ratón → segundos en el clip (contando el scroll horizontal). */
  function xToSeconds(clientX: number): number {
    const cont = scrollRef.current;
    if (!cont) return 0;
    const rect = cont.getBoundingClientRect();
    const x = clientX - rect.left + cont.scrollLeft;
    return clampTime(pxToSeconds(x, pps), duration);
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

  const step = tickStep(pps);
  const ticks: number[] = [];
  for (let t = 0; t <= duration + 0.001; t += step) ticks.push(t);

  const startPx = secondsToPx(trim.start, pps);
  const endPx = secondsToPx(trim.end, pps);
  const playPx = secondsToPx(playhead, pps);

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
            <span key={t} className="eav-tick" style={{ left: secondsToPx(t, pps) }}>
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
