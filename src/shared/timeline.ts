// Modelo puro del editor avanzado (sin React ni Electron): recorte, zoom, conversión tiempo↔px y
// volumen por pista. Lo comparten la UI del timeline y los tests.

import { clampTrackGain, type TrackVolumes } from './tracks';

/** Recorte: un único rango [start, end] en segundos (Fase 1; Fase 3 pasará a varios segmentos). */
export interface Trim {
  start: number;
  end: number;
}

/** Duración mínima de un recorte, para que los sliders/arrastres no dejen un rango sin sentido. */
export const MIN_TRIM_SECONDS = 0.5;

/** Zoom del timeline en píxeles por segundo. */
export const ZOOM_MIN = 4;
export const ZOOM_MAX = 240;
export const ZOOM_DEFAULT = 24;

/** Paso de volumen por “muesca” de rueda/arrastre (5 %). */
export const VOLUME_STEP = 0.05;

export function clampZoom(pxPerSecond: number): number {
  if (!Number.isFinite(pxPerSecond)) return ZOOM_DEFAULT;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pxPerSecond));
}

export function secondsToPx(seconds: number, pxPerSecond: number): number {
  return seconds * pxPerSecond;
}

/**
 * Escala efectiva del timeline en px/segundo: nunca por debajo del "fit" al ancho del contenedor.
 * Clip corto → llena el ancho (regla, pistas, playhead y asas comparten escala y alinean). Clip
 * largo → se usa el zoom del usuario y aparece scroll. Sin ancho medido aún, cae al zoom.
 */
export function effectivePxPerSecond(zoom: number, containerWidth: number, duration: number): number {
  const fit = duration > 0 && containerWidth > 0 ? containerWidth / duration : zoom;
  return Math.max(zoom, fit);
}

export function pxToSeconds(px: number, pxPerSecond: number): number {
  return pxPerSecond > 0 ? px / pxPerSecond : 0;
}

/** Acota un segundo cualquiera al rango reproducible [0, duration]. */
export function clampTime(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds)) return 0;
  return Math.min(Math.max(0, duration), Math.max(0, seconds));
}

/** Mueve el inicio del recorte, sin cruzar el fin (deja al menos MIN_TRIM_SECONDS). */
export function setTrimStart(trim: Trim, value: number, duration: number): Trim {
  const tope = Math.max(0, Math.min(trim.end, duration) - MIN_TRIM_SECONDS);
  return { start: Math.max(0, Math.min(value, tope)), end: trim.end };
}

/** Mueve el fin del recorte, sin cruzar el inicio (deja al menos MIN_TRIM_SECONDS). */
export function setTrimEnd(trim: Trim, value: number, duration: number): Trim {
  const piso = Math.min(duration, trim.start + MIN_TRIM_SECONDS);
  return { start: trim.start, end: Math.min(duration, Math.max(value, piso)) };
}

/** Fija el volumen (ganancia acotada) de una pista, devolviendo un mapa nuevo. */
export function setTrackVolume(volumes: TrackVolumes, key: string, gain: number): TrackVolumes {
  return { ...volumes, [key]: clampTrackGain(gain) };
}

/**
 * Nuevo volumen a partir de la rueda del ratón sobre una pista: hacia arriba sube, hacia abajo baja
 * (en el navegador `deltaY < 0` es rueda arriba). Acotado a [0, 2].
 */
export function wheelToGain(current: number, deltaY: number, step: number = VOLUME_STEP): number {
  const base = Number.isFinite(current) ? current : 1;
  return clampTrackGain(base + (deltaY < 0 ? step : -step));
}
