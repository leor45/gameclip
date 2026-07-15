import { useEffect, useState } from 'react';
import { filmstripSampleTimes, type Segment } from '@shared/timeline';
import { clipMediaUrl } from '../../lib/media';

/** Cuántas miniaturas fijas se muestrean a lo largo del clip (best-effort acotado). */
const FRAME_COUNT = 16;
/** Ancho de cada miniatura extraída (px); pequeño a propósito (coste acotado). */
const THUMB_WIDTH = 128;
/** Tope de tiempo total de extracción; si se pasa, se queda con lo que llevara. */
const TIMEOUT_MS = 12000;

// Cache por clip (sobrevive a re-montajes en la sesión): no se re-extrae al hacer zoom ni al re-render;
// las miniaturas se estiran para llenar el ancho. `pending` evita extracciones duplicadas simultáneas.
const cache = new Map<number, string[]>();
const pending = new Set<number>();

interface Props {
  clipId: number | null;
  /** Segmentos actuales: definen los tiempos de muestreo la primera vez que se extrae. */
  segments: Segment[];
  /** Duración de ORIGEN del clip (s). El muestreo espera a conocerla (>0): al montar aún es 0. */
  duration: number;
}

/**
 * Filmstrip de la pista de vídeo: miniaturas reales del clip a lo largo del tiempo, para orientarse al
 * recortar. Se extraen perezosamente en el renderer (un `<video>` oculto + `canvas`) y se cachean por
 * clip. **Best-effort:** si la extracción falla o no hay soporte de vídeo (tests), la barra queda vacía.
 */
export default function Filmstrip({ clipId, segments, duration }: Props) {
  const [frames, setFrames] = useState<string[]>(() => (clipId ? (cache.get(clipId) ?? []) : []));

  useEffect(() => {
    // Espera a conocer la duración (>0): al montar, el clip aún no cargó y `segments` tiene duración 0,
    // con lo que los tiempos de muestreo saldrían vacíos. Extraer/cachear ahí dejaría la barra vacía
    // para siempre (el efecto solo re-corre al cambiar clipId/duration, no en cada corte).
    if (!clipId || duration <= 0 || typeof document === 'undefined') return;
    const cached = cache.get(clipId);
    if (cached) {
      setFrames(cached);
      return;
    }
    if (pending.has(clipId)) return;
    const times = filmstripSampleTimes(segments, FRAME_COUNT);
    if (times.length === 0) return; // aún sin tiempos válidos: no se cachea vacío, se reintenta luego
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
    // Se extrae una sola vez por clip (al conocer la duración): cambiar los cortes no re-muestrea (se
    // estira). `segments` se lee para los tiempos pero no dispara re-extracción. Best-effort.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId, duration]);

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
