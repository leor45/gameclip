import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  keptDuration,
  outputStarts,
  outputToSource,
  pxToSeconds,
  secondsToPx,
  sourceToOutput,
  timelinePxPerSecond,
  type Segment,
} from '@shared/timeline';
import { formatDuration } from '@shared/library';
import SegmentBar from './SegmentBar';

interface Props {
  /** Factor de zoom (1× = la salida llena el ancho; más = scroll). */
  zoomFactor: number;
  /** Playhead en tiempo de ORIGEN (lo que reproduce el <video>). */
  playhead: number;
  /** Segmentos conservados; la timeline los muestra compactados (tiempo de salida, sin huecos). */
  segments: Segment[];
  selectedSegment: number | null;
  /** Reposiciona el playhead (recibe tiempo de ORIGEN). */
  onSeek: (sourceSeconds: number) => void;
  onSelectSegment: (index: number) => void;
  /** Recorta el borde inicial/final MOVIÉNDOLO `deltaSeconds` respecto al inicio del arrastre. */
  onTrimStartBy: (deltaSeconds: number) => void;
  onTrimEndBy: (deltaSeconds: number) => void;
  onTrimBegin: () => void;
  onTrimCommit: () => void;
  /** Filas de pista (vídeo + audios), que comparten el eje temporal de salida. */
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
  zoomFactor,
  playhead,
  segments,
  selectedSegment,
  onSeek,
  onSelectSegment,
  onTrimStartBy,
  onTrimEndBy,
  onTrimBegin,
  onTrimCommit,
  children,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  // Escala congelada mientras se arrastra un borde: evita que la timeline se re-escale bajo el cursor.
  const dragPpsRef = useRef<number | null>(null);

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

  const outLen = keptDuration(segments);
  // px/segundo de salida: "fit" a la duración de salida × zoom. Durante un arrastre de borde se
  // mantiene la escala del inicio del arrastre (dragPpsRef) para no rescalar mientras se recorta.
  const livePps = timelinePxPerSecond(zoomFactor, containerWidth, outLen);
  const pps = dragPpsRef.current ?? livePps;
  const width = Math.max(1, secondsToPx(outLen, pps));
  const starts = outputStarts(segments);

  /** clientX del ratón → tiempo de SALIDA (contando el scroll horizontal). */
  function xToOutput(clientX: number): number {
    const cont = scrollRef.current;
    if (!cont) return 0;
    const rect = cont.getBoundingClientRect();
    const x = clientX - rect.left + cont.scrollLeft;
    return Math.max(0, Math.min(outLen, pxToSeconds(x, pps)));
  }

  /** Arrastre para el playhead: reporta tiempo de ORIGEN (convierte salida→origen). */
  function seekDragging(e: React.PointerEvent) {
    e.preventDefault();
    const report = (clientX: number) => onSeek(outputToSource(segments, xToOutput(clientX)));
    report(e.clientX);
    const move = (ev: PointerEvent) => report(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** Arrastre de un borde: reporta el desplazamiento (delta en segundos) a escala congelada. */
  function trimDragging(reportBy: (deltaSeconds: number) => void) {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      dragPpsRef.current = livePps; // congela la escala durante el arrastre
      const x0 = e.clientX;
      onTrimBegin();
      const move = (ev: PointerEvent) => reportBy((ev.clientX - x0) / livePps);
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        dragPpsRef.current = null;
        onTrimCommit();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
  }

  const step = tickStep(pps);
  const ticks: number[] = [];
  for (let t = 0; t <= outLen + 0.001; t += step) ticks.push(t);

  const playPx = secondsToPx(sourceToOutput(segments, playhead), pps);

  return (
    <div className="eav-timeline" ref={scrollRef}>
      <div className="eav-timeline-inner" style={{ width }}>
        {/* Regla en tiempo de salida: click/arrastre para posicionar el playhead. */}
        <div
          className="eav-ruler"
          onPointerDown={seekDragging}
          role="slider"
          aria-label="Posición de reproducción"
          aria-valuemin={0}
          aria-valuemax={Math.round(outLen)}
          aria-valuenow={Math.round(sourceToOutput(segments, playhead))}
          tabIndex={0}
        >
          {ticks.map((t) => (
            <span key={t} className="eav-tick" style={{ left: secondsToPx(t, pps) }}>
              {formatDuration(t)}
            </span>
          ))}
        </div>

        {/* Barra de cortes: segmentos contiguos (sin huecos), seleccionables para borrar. */}
        <SegmentBar
          segments={segments}
          starts={starts}
          selected={selectedSegment}
          pxPerSecond={pps}
          onSelect={onSelectSegment}
        />

        <div className="eav-tracks">{children}</div>

        {/* Asas del recorte de bordes: inicio (0) y fin (duración de salida). Arrastre por delta. */}
        <div
          className="eav-trim-handle eav-trim-start"
          style={{ left: 0 }}
          onPointerDown={trimDragging(onTrimStartBy)}
          role="slider"
          aria-label="Inicio del recorte"
          aria-valuenow={0}
        />
        <div
          className="eav-trim-handle eav-trim-end"
          style={{ left: width }}
          onPointerDown={trimDragging(onTrimEndBy)}
          role="slider"
          aria-label="Fin del recorte"
          aria-valuenow={Math.round(outLen)}
        />

        {/* Playhead. */}
        <div className="eav-playhead" style={{ left: playPx }} />
      </div>
    </div>
  );
}
