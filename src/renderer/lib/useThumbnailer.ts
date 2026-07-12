import { useEffect } from 'react';
import type { Clip } from '@shared/library';
import { clipMediaUrl } from './media';

const THUMB_WIDTH = 320;
const TIMEOUT_MS = 10000;

/**
 * Genera duración y thumbnail para el primer clip que no los tenga (video/imagen → canvas →
 * dataURL → IPC). Procesa uno por ciclo: setMedia dispara 'changed', la lista se recarga
 * y el efecto vuelve a correr hasta que no quedan pendientes. Si la generación falla,
 * no reintenta hasta la próxima recarga (sin bucles).
 *
 * Las capturas también llevan miniatura propia: pintar el PNG entero en cada tarjeta de la grilla
 * es justo el coste que la app evita (corre mientras el usuario juega).
 */
export function useThumbnailer(clips: Clip[] | null): void {
  useEffect(() => {
    const pendiente = clips?.find((c) => c.durationSeconds === null || !c.thumbnailPath);
    if (!pendiente) return;
    let cancelado = false;

    const extraer = pendiente.kind === 'image' ? extraerImagen : extraerMedia;
    void extraer(pendiente).then((media) => {
      if (cancelado || !media) return;
      window.gameclip.library.setMedia(pendiente.id, media).catch(() => {
        // el clip pudo borrarse mientras se generaba
      });
    });

    return () => {
      cancelado = true;
    };
  }, [clips]);
}

/**
 * Miniatura de una captura. La duración va a 0 (una imagen no dura): sin un número, el clip
 * quedaría eternamente "pendiente" y el efecto lo reintentaría en cada recarga.
 */
function extraerImagen(
  clip: Clip,
): Promise<{ durationSeconds: number; thumbnailDataUrl?: string } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    let terminado = false;

    const finalizar = (resultado: { durationSeconds: number; thumbnailDataUrl?: string } | null) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(timer);
      resolve(resultado);
    };
    const timer = setTimeout(() => finalizar(null), TIMEOUT_MS);

    img.onerror = () => finalizar(null);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ratio = img.naturalHeight / img.naturalWidth || 9 / 16;
        canvas.width = THUMB_WIDTH;
        canvas.height = Math.round(THUMB_WIDTH * ratio);
        const ctx = canvas.getContext('2d');
        if (!ctx) return finalizar({ durationSeconds: 0 });
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        finalizar({ durationSeconds: 0, thumbnailDataUrl: canvas.toDataURL('image/jpeg', 0.75) });
      } catch {
        finalizar({ durationSeconds: 0 });
      }
    };
    img.src = clipMediaUrl(clip.id);
  });
}

function extraerMedia(
  clip: Clip,
): Promise<{ durationSeconds: number; thumbnailDataUrl?: string } | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    let terminado = false;

    const finalizar = (resultado: { durationSeconds: number; thumbnailDataUrl?: string } | null) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      resolve(resultado);
    };
    const timer = setTimeout(() => finalizar(null), TIMEOUT_MS);

    video.preload = 'auto';
    video.muted = true;
    video.onerror = () => finalizar(null);
    video.onloadedmetadata = () => {
      // Frame representativo: al 10 % del clip (máx. 3 s), evitando el frame 0 negro.
      video.currentTime = Math.min(3, video.duration * 0.1);
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const ratio = video.videoHeight / video.videoWidth || 9 / 16;
        canvas.width = THUMB_WIDTH;
        canvas.height = Math.round(THUMB_WIDTH * ratio);
        const ctx = canvas.getContext('2d');
        if (!ctx) return finalizar({ durationSeconds: video.duration });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        finalizar({
          durationSeconds: video.duration,
          thumbnailDataUrl: canvas.toDataURL('image/jpeg', 0.75),
        });
      } catch {
        finalizar({ durationSeconds: video.duration });
      }
    };
    video.src = clipMediaUrl(clip.id);
  });
}
