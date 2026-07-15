import { useEffect, useRef } from 'react';
import { keptDuration, outputStarts, type Segment } from '@shared/timeline';

interface Props {
  /** Picos normalizados 0..1 de la pista, sobre la duración de ORIGEN del clip. */
  peaks: number[];
  /** Ganancia actual (0..2): escala la altura de la onda para el feedback visual. */
  gain: number;
  /** Segmentos conservados: la onda se dibuja compactada (solo lo conservado, sin huecos). */
  segments: Segment[];
  /** Duración de origen del clip (para mapear picos↔tiempo). */
  duration: number;
  /** Atenuada (pista eliminada): se dibuja apagada. */
  dimmed?: boolean;
}

/** Alto del lienzo de la onda en px (CSS). */
const HEIGHT = 44;

/**
 * Dibuja la forma de onda de una pista en un `<canvas>`, **compactada** a los segmentos conservados
 * (los huecos borrados no se dibujan) y escalada por el volumen. Se redibuja al cambiar el tamaño
 * (zoom/recorte) con un ResizeObserver. En jsdom no hay contexto 2D ni ResizeObserver: todo se
 * protege y no rompe los tests.
 */
export default function Waveform({ peaks, gain, segments, duration, dimmed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      let ctx: CanvasRenderingContext2D | null = null;
      try {
        ctx = canvas.getContext('2d');
      } catch {
        return; // jsdom lanza en getContext
      }
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas.clientWidth || 300;
      canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
      canvas.height = Math.floor(HEIGHT * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, HEIGHT);

      const n = peaks.length;
      const outLen = keptDuration(segments);
      if (n === 0 || outLen <= 0 || duration <= 0) return;

      const mid = HEIGHT / 2;
      ctx.fillStyle = dimmed ? 'rgba(139,144,160,0.5)' : '#f5c518';
      const starts = outputStarts(segments);

      // Cada segmento: su tramo de picos (por tiempo de origen) dibujado en su hueco de salida.
      for (let si = 0; si < segments.length; si++) {
        const seg = segments[si];
        const i0 = Math.floor((seg.start / duration) * n);
        const i1 = Math.min(n, Math.ceil((seg.end / duration) * n));
        const nBars = i1 - i0;
        if (nBars <= 0) continue;
        const xStart = (starts[si] / outLen) * cssWidth;
        const xW = ((seg.end - seg.start) / outLen) * cssWidth;
        const barW = xW / nBars;
        const gap = barW > 2 ? 0.5 : 0;
        for (let k = 0; k < nBars; k++) {
          const h = Math.min(1, peaks[i0 + k] * gain) * (mid - 1);
          ctx.fillRect(xStart + k * barW, mid - h, Math.max(0.5, barW - gap), h * 2 || 1);
        }
      }
    };

    draw();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [peaks, gain, segments, duration, dimmed]);

  return <canvas ref={canvasRef} className="waveform-canvas" style={{ height: HEIGHT }} />;
}
