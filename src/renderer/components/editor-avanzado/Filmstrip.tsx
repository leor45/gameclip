import { useEffect, useState } from 'react';
import type { Segment } from '@shared/timeline';
import { clipMediaUrl } from '../../lib/media';

/** Cuántas miniaturas fijas se muestrean a lo largo del clip (best-effort acotado). */
const FRAME_COUNT = 24;
/** Ancho de cada miniatura extraída (px); pequeño a propósito (coste acotado). */
const THUMB_WIDTH = 128;
/** Tope de tiempo total de extracción; si se pasa, se queda con lo que llevara. */
const TIMEOUT_MS = 12000;

// Cache por clip (sobrevive a re-montajes en la sesión): no se re-extrae al cortar, recortar ni hacer
// zoom. `pending` evita extracciones duplicadas simultáneas.
const cache = new Map<number, string[]>();
const pending = new Set<number>();

/** Tiempos de muestreo: `FRAME_COUNT` puntos repartidos por el centro de cada tramo de TODO el origen. */
export function frameTimes(duration: number, count = FRAME_COUNT): number[] {
  if (duration <= 0 || count <= 0) return [];
  return Array.from({ length: count }, (_, i) => ((i + 0.5) * duration) / count);
}

/**
 * Miniaturas reales del clip, repartidas de forma uniforme sobre todo el origen (no sobre lo
 * conservado): así cada trozo de la timeline enseña las suyas sin volver a extraer al cortar. Se
 * extraen perezosamente en el renderer (un `<video>` oculto + `canvas`) y se cachean por clip.
 * **Best-effort:** si falla o no hay soporte de vídeo (tests), devuelve una lista vacía.
 */
export function useFilmstripFrames(clipId: number | null, duration: number): string[] {
  const [frames, setFrames] = useState<string[]>(() => (clipId ? (cache.get(clipId) ?? []) : []));

  useEffect(() => {
    // Espera a conocer la duración (>0): al montar, el clip aún no cargó.
    if (!clipId || duration <= 0 || typeof document === 'undefined') return;
    const cached = cache.get(clipId);
    if (cached) {
      setFrames(cached);
      return;
    }
    if (pending.has(clipId)) return;
    const times = frameTimes(duration);
    pending.add(clipId);
    const cancel = extractFrames(clipId, times, (imgs) => {
      if (imgs.length > 0) cache.set(clipId, imgs); // no cachear un fallo vacío: permite reintentar
      pending.delete(clipId);
      setFrames(imgs);
    });
    return () => {
      cancel();
      pending.delete(clipId);
    };
  }, [clipId, duration]);

  return frames;
}

interface Props {
  clipId: number | null;
  /** Duración de ORIGEN del clip (s). El muestreo espera a conocerla (>0): al montar aún es 0. */
  duration: number;
  /** Ya no condiciona el muestreo (siempre es sobre todo el origen); se acepta por compatibilidad. */
  segments?: Segment[];
}

/** Tira de fotogramas de todo el clip, de borde a borde (el recorte del editor básico). */
export default function Filmstrip({ clipId, duration }: Props) {
  const frames = useFilmstripFrames(clipId, duration);
  if (frames.length === 0) return <div className="eav-track-video-bar" />;
  return (
    <div className="eav-track-video-bar eav-filmstrip">
      {frames.map((src, i) => (
        <img key={i} src={src} alt="" className="eav-filmstrip-frame" draggable={false} />
      ))}
    </div>
  );
}

/**
 * Los fotogramas de UN trozo de la timeline: cada miniatura se coloca por su tiempo de origen, así el
 * bloque enseña exactamente su tramo (recortado por sus bordes).
 */
export function FilmstripBlock({
  frames,
  segment,
  duration,
  pxPerSecond,
}: {
  frames: string[];
  segment: Segment;
  duration: number;
  pxPerSecond: number;
}) {
  if (frames.length === 0 || duration <= 0) return null;
  const paso = duration / frames.length;
  const ancho = paso * pxPerSecond;
  return (
    <div className="eav-clip-frames" aria-hidden="true">
      {frames.map((src, k) => {
        const t0 = k * paso;
        if (t0 + paso <= segment.start || t0 >= segment.end) return null;
        return (
          <img
            key={k}
            src={src}
            alt=""
            draggable={false}
            style={{ left: (t0 - segment.start) * pxPerSecond, width: ancho }}
          />
        );
      })}
    </div>
  );
}

/**
 * Extrae miniaturas en los `times` (segundos de origen) de un `<video>` oculto, en serie (un `seek` a la
 * vez). Devuelve una función para **cancelar** (limpia el temporizador y suelta el vídeo). Best-effort:
 * cualquier fallo termina con lo que llevara.
 */
function extractFrames(
  clipId: number,
  times: number[],
  onDone: (frames: string[]) => void,
): () => void {
  const results: string[] = [];
  if (times.length === 0) {
    onDone(results);
    return () => undefined;
  }

  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  const canvas = document.createElement('canvas');
  let index = 0;
  let done = false;

  const cleanup = () => {
    clearTimeout(timer);
    video.removeAttribute('src');
    try {
      video.load();
    } catch {
      // best-effort
    }
  };
  const finish = () => {
    if (done) return;
    done = true;
    cleanup();
    onDone(results);
  };
  const timer = setTimeout(finish, TIMEOUT_MS);

  const seekNext = () => {
    if (index >= times.length) return finish();
    video.currentTime = Math.max(0, times[index]);
  };

  video.onerror = finish;
  video.onloadedmetadata = seekNext;
  video.onseeked = () => {
    try {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w > 0 && h > 0) {
        canvas.width = THUMB_WIDTH;
        canvas.height = Math.max(1, Math.round((THUMB_WIDTH * h) / w));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          results.push(canvas.toDataURL('image/jpeg', 0.6));
        }
      }
    } catch {
      // salta esta miniatura
    }
    index++;
    seekNext();
  };

  video.src = clipMediaUrl(clipId);

  return () => {
    if (done) return;
    done = true;
    cleanup();
  };
}
