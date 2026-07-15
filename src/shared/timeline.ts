// Modelo puro del editor avanzado (sin React ni Electron): recorte, zoom, conversión tiempo↔px y
// volumen por pista. Lo comparten la UI del timeline y los tests.

import { clampTrackGain, type TrackVolumes } from './tracks';

/**
 * Un segmento **conservado** de la edición, en tiempo de origen (Fase 3). La edición es una lista
 * ordenada y sin solape de segmentos; los huecos entre ellos son lo borrado. La salida (preview y
 * render) es la concatenación de los segmentos. Un recorte simple = un único segmento.
 */
export interface Segment {
  start: number;
  end: number;
}

/** Duración mínima de un segmento, para que dividir/arrastrar no deje un trozo sin sentido. */
export const MIN_TRIM_SECONDS = 0.5;

/** Edición inicial: todo el clip como un único segmento. */
export function initialSegments(duration: number): Segment[] {
  return [{ start: 0, end: Math.max(0, duration) }];
}

/** Suma de las longitudes de los segmentos: la duración de la salida (lo conservado). */
export function keptDuration(segments: Segment[]): number {
  return segments.reduce((total, s) => total + Math.max(0, s.end - s.start), 0);
}

/**
 * Tiempo de origen → tiempo de **salida** (la timeline compactada, sin huecos). Si `t` cae dentro de
 * un segmento, su posición acumulada; si cae en un hueco, el borde del hueco (los huecos tienen ancho
 * cero en la salida); pasado el final, la duración conservada. Puro y testeable.
 */
export function sourceToOutput(segments: Segment[], t: number): number {
  let acc = 0;
  for (const s of segments) {
    if (t < s.start) return acc; // antes de este segmento (en un hueco o antes del primero)
    if (t <= s.end) return acc + (t - s.start); // dentro
    acc += s.end - s.start;
  }
  return acc; // pasado el último → keptDuration
}

/** Tiempo de **salida** → tiempo de origen. Inverso de `sourceToOutput` (acota a la salida válida). */
export function outputToSource(segments: Segment[], o: number): number {
  const clamped = Math.max(0, Math.min(o, keptDuration(segments)));
  let acc = 0;
  for (const s of segments) {
    const d = s.end - s.start;
    if (clamped <= acc + d) return s.start + (clamped - acc);
    acc += d;
  }
  return segments[segments.length - 1]?.end ?? 0;
}

/** Offset de salida (acumulado) de cada segmento, para dibujarlos contiguos en la timeline. */
export function outputStarts(segments: Segment[]): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const s of segments) {
    starts.push(acc);
    acc += Math.max(0, s.end - s.start);
  }
  return starts;
}

/** Índice del segmento que contiene `t` (`start ≤ t < end`), o −1 si cae en un hueco o fuera. */
export function segmentAt(segments: Segment[], t: number): number {
  return segments.findIndex((s) => t >= s.start && t < s.end);
}

/**
 * Divide en `t` el segmento que lo contiene. No divide (devuelve la lista igual) si `t` no cae dentro
 * de ningún segmento o si algún trozo quedaría por debajo de `MIN_TRIM_SECONDS`.
 */
export function splitAt(segments: Segment[], t: number): Segment[] {
  const i = segments.findIndex((s) => t > s.start && t < s.end);
  if (i < 0) return segments;
  const s = segments[i];
  if (t - s.start < MIN_TRIM_SECONDS || s.end - t < MIN_TRIM_SECONDS) return segments;
  return [
    ...segments.slice(0, i),
    { start: s.start, end: t },
    { start: t, end: s.end },
    ...segments.slice(i + 1),
  ];
}

/** Borra el segmento en `index` (crea un hueco). Nunca deja la lista vacía. */
export function deleteSegment(segments: Segment[], index: number): Segment[] {
  if (index < 0 || index >= segments.length || segments.length <= 1) return segments;
  return segments.filter((_, i) => i !== index);
}

/**
 * Siguiente tiempo **conservado** ≥ `t`, para el ripple en reproducción: si `t` está dentro de un
 * segmento, `t`; si cae en un hueco, el inicio del siguiente segmento; si pasó el último, `null`.
 */
export function nextKeptTime(segments: Segment[], t: number): number | null {
  for (const s of segments) {
    if (t < s.start) return s.start; // t está antes de este segmento (en un hueco)
    if (t < s.end) return t; // t está dentro de este segmento
  }
  return null; // pasado el último segmento
}

/** Mueve el inicio del recorte (borde del primer segmento), sin cruzar su fin (deja el mínimo). */
export function setSegmentsStart(segments: Segment[], value: number, duration: number): Segment[] {
  const first = segments[0];
  if (!first) return segments;
  const tope = Math.max(0, Math.min(first.end, duration) - MIN_TRIM_SECONDS);
  const start = Math.max(0, Math.min(value, tope));
  return [{ start, end: first.end }, ...segments.slice(1)];
}

/** Mueve el fin del recorte (borde del último segmento), sin cruzar su inicio ni pasar la duración. */
export function setSegmentsEnd(segments: Segment[], value: number, duration: number): Segment[] {
  const last = segments[segments.length - 1];
  if (!last) return segments;
  const piso = Math.min(duration, last.start + MIN_TRIM_SECONDS);
  const end = Math.min(duration, Math.max(value, piso));
  return [...segments.slice(0, -1), { start: last.start, end }];
}

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
