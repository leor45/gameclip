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

/**
 * Zoom como **factor sobre el "fit"** al ancho: 1× = el clip llena todo el ancho; 2× = el doble
 * (con scroll). Nunca baja de 1× (por debajo quedaría espacio vacío). Modelarlo como factor —y no
 * como px/segundo absolutos— hace que "+"/"–" funcionen igual en clips cortos y largos.
 */
export const ZOOM_FACTOR_MIN = 1;
export const ZOOM_FACTOR_MAX = 24;
export const ZOOM_FACTOR_STEP = 1.4;

/** px/segundo de referencia cuando aún no se midió el ancho (tests/jsdom sin layout). */
const FALLBACK_PPS = 24;

/** Paso de volumen por “muesca” de rueda/arrastre (5 %). */
export const VOLUME_STEP = 0.05;

export function clampZoomFactor(factor: number): number {
  if (!Number.isFinite(factor)) return ZOOM_FACTOR_MIN;
  return Math.min(ZOOM_FACTOR_MAX, Math.max(ZOOM_FACTOR_MIN, factor));
}

export function secondsToPx(seconds: number, pxPerSecond: number): number {
  return seconds * pxPerSecond;
}

/**
 * px/segundo efectivos del timeline: el "fit" al ancho (ancho/duración) multiplicado por el factor
 * de zoom. A factor 1 llena el ancho exacto (regla, pistas, playhead y asas comparten escala y
 * alinean); a más factor, se agranda y aparece scroll. Sin ancho medido aún, usa un px/s de reserva.
 */
export function timelinePxPerSecond(
  zoomFactor: number,
  containerWidth: number,
  duration: number,
): number {
  const base = duration > 0 && containerWidth > 0 ? containerWidth / duration : FALLBACK_PPS;
  return base * clampZoomFactor(zoomFactor);
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
