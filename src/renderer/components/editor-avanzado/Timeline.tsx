import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
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

/** Una pista de la timeline (vídeo o audio): su cabecera y lo que se dibuja dentro de cada trozo. */
export interface TimelineLane {
  key: string;
  kind: 'video' | 'audio';
  /** Cabecera fija a la izquierda (icono, nombre, volumen…). */
  head: ReactNode;
  /** Contenido de un trozo en esta pista (fotogramas u onda de su tramo de origen). */
  renderBlock: (segment: Segment, index: number, pxPerSecond: number) => ReactNode;
  /** Pista quitada del render: sus trozos se ven apagados. */
  dimmed?: boolean;
  /** Rueda sobre la pista (volumen). */
  onWheel?: (deltaY: number) => void;
}

export type Borde = 'start' | 'end';

interface Props {
  /** Factor de zoom (1× = la salida llena el ancho; más = scroll). */
  zoomFactor: number;
  /** Playhead en tiempo de ORIGEN (lo que reproduce el <video>). */
  playhead: number;
  /** Segmentos conservados: cada uno es un trozo (bloque) en todas las pistas. */
  segments: Segment[];
  selectedSegment: number | null;
  lanes: TimelineLane[];
  /** Reposiciona el playhead (recibe tiempo de ORIGEN). */
  onSeek: (sourceSeconds: number) => void;
  onSelectSegment: (index: number) => void;
  /** Empieza a arrastrar el borde de un trozo (un solo paso de deshacer hasta `onTrimCommit`). */
  onTrimBegin: (index: number) => void;
  /** Durante el arrastre: el borde se ha movido `deltaSeconds` respecto al inicio del arrastre. */
  onTrimBy: (index: number, side: Borde, deltaSeconds: number) => void;
  onTrimCommit: () => void;
  /** Teclado sobre un asa: mueve ese borde `deltaSeconds` (un paso de deshacer). */
  onTrimStep: (index: number, side: Borde, deltaSeconds: number) => void;
}

/** Separación deseada entre marcas de la regla, en px: se elige el paso "bonito" más cercano. */
const TICK_TARGET_PX = 80;
const PASOS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
/** Hueco visible entre dos trozos (px): el corte se ve. */
const HUECO = 6;
/** Paso de las asas con el teclado (s); con Mayús, `PASO_LARGO`. */
const PASO = 0.1;
const PASO_LARGO = 1;

function tickStep(pxPerSecond: number): number {
  const objetivo = TICK_TARGET_PX / pxPerSecond; // segundos por marca deseados
  return PASOS.find((p) => p >= objetivo) ?? PASOS[PASOS.length - 1];
}

/**
 * Timeline del editor avanzado, por trozos (tipo DaVinci): cabeceras fijas a la izquierda y, a la
 * derecha, cada segmento conservado como un bloque propio en TODAS las pistas, separado del siguiente
 * por un hueco. El seleccionado se marca en todas. Cada bloque tiene asas en sus bordes para recortarle
 * el principio o el final (sin cruzar a su vecino: lo acota quien recibe `onTrimBy`).
 *
 * El eje es el tiempo de SALIDA (compactado: lo borrado no ocupa sitio).
 */
export default function Timeline({
  zoomFactor,
  playhead,
  segments,
  selectedSegment,
  lanes,
  onSeek,
  onSelectSegment,
  onTrimBegin,
  onTrimBy,
  onTrimCommit,
  onTrimStep,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  // Escala congelada mientras se arrastra un borde: la timeline no se re-escala bajo el cursor.
  const dragPpsRef = useRef<number | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

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
  // px/segundo de salida: "fit" a la duración de salida × zoom. Los huecos entre trozos salen de los
  // propios bloques (cada uno cede la mitad en el corte): la escala y el cabezal no se desplazan.
  const livePps = timelinePxPerSecond(zoomFactor, containerWidth, outLen);
  const pps = dragPpsRef.current ?? livePps;
  const starts = outputStarts(segments);
  const xDe = (o: number) => secondsToPx(o, pps);
  const width = Math.max(1, xDe(outLen));

  /** clientX → tiempo de SALIDA (descontando huecos y contando el scroll horizontal). */
  function xToOutput(clientX: number): number {
    const cont = scrollRef.current;
    if (!cont) return 0;
    const rect = cont.getBoundingClientRect();
    const x = clientX - rect.left + cont.scrollLeft;
    return Math.max(0, Math.min(outLen, pxToSeconds(x, pps)));
  }

  /** Arrastre para el playhead (regla o fondo): reporta tiempo de ORIGEN. */
  function seekDragging(e: ReactPointerEvent) {
    if (e.button !== 0) return;
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

  /** Arrastre del borde de un trozo: reporta el desplazamiento (s) a escala congelada. */
  function trimDragging(index: number, side: Borde) {
    return (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      dragPpsRef.current = livePps;
      setArrastrando(true);
      const x0 = e.clientX;
      onSelectSegment(index);
      onTrimBegin(index);
      const move = (ev: PointerEvent) => onTrimBy(index, side, (ev.clientX - x0) / livePps);
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        dragPpsRef.current = null;
        setArrastrando(false);
        onTrimCommit();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
  }

  function onAsaKey(index: number, side: Borde) {
    return (e: ReactKeyboardEvent) => {
      const paso = e.shiftKey ? PASO_LARGO : PASO;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        onTrimStep(index, side, e.key === 'ArrowLeft' ? -paso : paso);
      }
    };
  }

  /** Clic en un trozo: lo selecciona y lleva el cabezal a ese punto. */
  function onBloqueDown(index: number) {
    return (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      onSelectSegment(index);
      seekDragging(e);
    };
  }

  const step = tickStep(pps);
  const ticks: number[] = [];
  for (let t = 0; t <= outLen - step * 0.4; t += step) ticks.push(t);
  const playPx = xDe(sourceToOutput(segments, playhead));

  return (
    <div className={arrastrando ? 'eav-timeline is-dragging' : 'eav-timeline'}>
      <div className="eav-tl-heads">
        <div className="eav-tl-rulerpad" />
        {lanes.map((l) => (
          <div key={l.key} className={`eav-tl-head is-${l.kind}${l.dimmed ? ' is-dimmed' : ''}`}>
            {l.head}
          </div>
        ))}
      </div>

      <div className="eav-tl-scroll" ref={scrollRef}>
        <div className="eav-tl-inner" style={{ width }}>
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
              <span key={t} className="eav-tick" style={{ left: xDe(t) }}>
                {formatDuration(t)}
              </span>
            ))}
          </div>

          {lanes.map((l) => (
            <LaneRow key={l.key} lane={l} onBackgroundDown={seekDragging}>
              {segments.map((s, i) => {
                const hIzq = i > 0 ? HUECO / 2 : 0;
                const hDer = i < segments.length - 1 ? HUECO / 2 : 0;
                const left = xDe(starts[i]) + hIzq;
                const w = Math.max(4, secondsToPx(s.end - s.start, pps) - hIzq - hDer);
                const sel = i === selectedSegment;
                const esVideo = l.kind === 'video';
                return (
                  <div
                    key={i}
                    className={sel ? 'eav-clip is-selected' : 'eav-clip'}
                    style={{ left, width: w }}
                    onPointerDown={onBloqueDown(i)}
                    {...(esVideo
                      ? {
                          role: 'button',
                          tabIndex: 0,
                          'aria-label': `Segmento ${i + 1}${sel ? ' (seleccionado)' : ''}`,
                          'aria-pressed': sel,
                          onClick: () => onSelectSegment(i),
                          onKeyDown: (e: ReactKeyboardEvent) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectSegment(i);
                            }
                          },
                        }
                      : {})}
                  >
                    {l.renderBlock(s, i, pps)}
                    {esVideo && <span className="eav-clip-num">{i + 1}</span>}
                    {(['start', 'end'] as const).map((side) => (
                      <span
                        key={side}
                        className={`eav-clip-edge is-${side}`}
                        onPointerDown={trimDragging(i, side)}
                        {...(esVideo
                          ? {
                              role: 'slider',
                              tabIndex: 0,
                              'aria-label': `${side === 'start' ? 'Inicio' : 'Fin'} del segmento ${i + 1}`,
                              'aria-valuemin': 0,
                              'aria-valuenow':
                                Math.round((side === 'start' ? s.start : s.end) * 10) / 10,
                              'aria-valuetext': formatDuration(side === 'start' ? s.start : s.end),
                              onKeyDown: onAsaKey(i, side),
                            }
                          : { 'aria-hidden': true })}
                      />
                    ))}
                  </div>
                );
              })}
            </LaneRow>
          ))}

          {/* Playhead. */}
          <div className="eav-playhead" style={{ left: playPx }} />
        </div>
      </div>
    </div>
  );
}

/** Fila de una pista: el fondo mueve el cabezal; la rueda (si la pista la usa) va con listener nativo. */
function LaneRow({
  lane,
  onBackgroundDown,
  children,
}: {
  lane: TimelineLane;
  onBackgroundDown: (e: ReactPointerEvent) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onWheelRef = useRef(lane.onWheel);
  onWheelRef.current = lane.onWheel;
  const conRueda = Boolean(lane.onWheel);

  // React registra la rueda como pasiva y no deja preventDefault: listener nativo no pasivo.
  useEffect(() => {
    const el = ref.current;
    if (!el || !conRueda) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      onWheelRef.current?.(e.deltaY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [conRueda]);

  return (
    <div
      ref={ref}
      className={`eav-lane is-${lane.kind}${lane.dimmed ? ' is-dimmed' : ''}`}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onBackgroundDown(e);
      }}
    >
      {children}
    </div>
  );
}
