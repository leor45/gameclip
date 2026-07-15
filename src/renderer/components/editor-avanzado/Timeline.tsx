import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  clampTime,
  pxToSeconds,
  secondsToPx,
  timelinePxPerSecond,
  type Segment,
} from '@shared/timeline';
import { formatDuration } from '@shared/library';
import SegmentBar from './SegmentBar';

interface Props {
  duration: number;
  /** Factor de zoom (1× = el clip llena el ancho; más = scroll). */
  zoomFactor: number;
  playhead: number;
  /** Segmentos conservados (Fase 3); los huecos entre ellos son lo borrado. */
  segments: Segment[];
  selectedSegment: number | null;
  onSeek: (seconds: number) => void;
  onSelectSegment: (index: number) => void;
  onTrimStart: (seconds: number) => void;
  onTrimEnd: (seconds: number) => void;
  /** Empieza un arrastre de borde: el editor guarda el estado para deshacer (un paso por arrastre). */
  onTrimBegin: () => void;
  /** Termina el arrastre de borde: el editor confirma el paso de historial. */
  onTrimCommit: () => void;
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
  segments,
  selectedSegment,
  onSeek,
  onSelectSegment,
  onTrimStart,
  onTrimEnd,
  onTrimBegin,
  onTrimCommit,
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
  function dragging(
    report: (seconds: number) => void,
    opts?: { onStart?: () => void; onEnd?: () => void },
  ) {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      opts?.onStart?.();
      report(xToSeconds(e.clientX));
      const move = (ev: PointerEvent) => report(xToSeconds(ev.clientX));
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        opts?.onEnd?.();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
  }

  const step = tickStep(pps);
  const ticks: number[] = [];
  for (let t = 0; t <= duration + 0.001; t += step) ticks.push(t);

  const firstStart = segments[0]?.start ?? 0;
  const lastEnd = segments[segments.length - 1]?.end ?? duration;
  const startPx = secondsToPx(firstStart, pps);
  const endPx = secondsToPx(lastEnd, pps);
  const playPx = secondsToPx(playhead, pps);

  // Zonas borradas (atenuadas): antes del primer segmento, entre segmentos, y tras el último.
  const shades: { left: number; width: number }[] = [];
  if (firstStart > 0) shades.push({ left: 0, width: startPx });
  for (let i = 0; i < segments.length - 1; i++) {
    const a = segments[i].end;
    const b = segments[i + 1].start;
    if (b > a) shades.push({ left: secondsToPx(a, pps), width: secondsToPx(b - a, pps) });
  }
  if (lastEnd < duration) shades.push({ left: endPx, width: Math.max(0, width - endPx) });

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

        {/* Barra de cortes: bloques de segmentos, seleccionables para borrar. */}
        <SegmentBar
          segments={segments}
          selected={selectedSegment}
          pxPerSecond={pps}
          onSelect={onSelectSegment}
        />

        <div className="eav-tracks">{children}</div>

        {/* Zonas atenuadas fuera de lo conservado (bordes + huecos entre segmentos). */}
        {shades.map((s, i) => (
          <div key={i} className="eav-trim-shade" style={{ left: s.left, width: s.width }} />
        ))}

        {/* Asas del recorte: borde del primer y último segmento. */}
        <div
          className="eav-trim-handle eav-trim-start"
          style={{ left: startPx }}
          onPointerDown={dragging(onTrimStart, { onStart: onTrimBegin, onEnd: onTrimCommit })}
          role="slider"
          aria-label="Inicio del recorte"
          aria-valuenow={Math.round(firstStart)}
        />
        <div
          className="eav-trim-handle eav-trim-end"
          style={{ left: endPx }}
          onPointerDown={dragging(onTrimEnd, { onStart: onTrimBegin, onEnd: onTrimCommit })}
          role="slider"
          aria-label="Fin del recorte"
          aria-valuenow={Math.round(lastEnd)}
        />

        {/* Playhead. */}
        <div className="eav-playhead" style={{ left: playPx }} />
      </div>
    </div>
  );
}
