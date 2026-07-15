import { useEffect, useRef } from 'react';

interface Props {
  /** Picos normalizados 0..1 de la pista. */
  peaks: number[];
  /** Ganancia actual (0..2): escala la altura de la onda para el feedback visual. */
  gain: number;
  /** Atenuada (pista eliminada): se dibuja apagada. */
  dimmed?: boolean;
}

/** Alto del lienzo de la onda en px (CSS). */
const HEIGHT = 44;

/**
 * Dibuja la forma de onda de una pista en un `<canvas>`, escalada por el volumen. Se redibuja al
 * cambiar el tamaño (zoom del timeline) con un ResizeObserver. En jsdom no hay contexto 2D ni
 * ResizeObserver: todo se protege y no rompe los tests.
 */
export default function Waveform({ peaks, gain, dimmed }: Props) {
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
      if (peaks.length === 0) return;

      const mid = HEIGHT / 2;
      ctx.fillStyle = dimmed ? 'rgba(139,144,160,0.5)' : '#f5c518';
      const barW = cssWidth / peaks.length;
      const gap = barW > 2 ? 0.5 : 0;
      for (let i = 0; i < peaks.length; i++) {
        const h = Math.min(1, peaks[i] * gain) * (mid - 1);
        ctx.fillRect(i * barW, mid - h, Math.max(0.5, barW - gap), h * 2 || 1);
      }
    };

    draw();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [peaks, gain, dimmed]);

  return <canvas ref={canvasRef} className="waveform-canvas" style={{ height: HEIGHT }} />;
}
