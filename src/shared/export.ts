// Dominio de exportación de clips: tipos y validación pura (sin Electron ni ffmpeg).

import { hasReframe, normalizeReframe, type Reframe } from './reframe';
import { keptDuration, type Segment } from './timeline';
import { normalizeMutedTracks, normalizeTrackVolumes, type TrackVolumes } from './tracks';

export type ExportFormat = 'mp4' | 'gif';
export type ExportQuality = 'alta' | 'media' | 'baja';

export interface ExportRequest {
  clipId: number;
  startSeconds: number;
  endSeconds: number;
  format: ExportFormat;
  quality: ExportQuality;
  /**
   * Pistas de audio muteadas (claves de `trackKey`): el MP4 exportado lleva solo la mezcla de
   * las marcadas. Sin definir → el audio del clip tal cual.
   */
  mutedTracks?: string[];
  /**
   * Volumen por pista (editor avanzado): clave de `trackKey` → ganancia `0..2`. Tiene precedencia
   * sobre `mutedTracks`; una pista en 0 equivale a muteada.
   */
  trackVolumes?: TrackVolumes;
  /**
   * Segmentos conservados (editor avanzado, Fase 3): la salida los concatena. Con ≥2 segmentos hay
   * cortes; `startSeconds/endSeconds` quedan como el rango exterior (primer inicio / último fin).
   */
  segments?: Segment[];
  /**
   * Reencuadre de vídeo (editor avanzado, Fase 4): relación de aspecto de salida + recorte/barras.
   * Solo se manda cuando reencuadra (no `original`), junto con `sourceWidth/Height`.
   */
  reframe?: Reframe;
  /** Dimensiones de la fuente en píxeles, para calcular la geometría del reencuadre (del `<video>`). */
  sourceWidth?: number;
  sourceHeight?: number;
}

export type ExportStatus = 'done' | 'canceled' | 'error';

export interface ExportResult {
  status: ExportStatus;
  /** Ruta del archivo exportado cuando status === 'done'. */
  outputPath?: string;
  /** Mensaje de error cuando status === 'error'. */
  message?: string;
}

export interface ExportProgress {
  /** Avance 0–1 (estimado sobre la duración del recorte). */
  ratio: number;
}

/** Duración mínima exportable: evita pedidos sin sentido por redondeo de sliders. */
export const EXPORT_MIN_SECONDS = 0.5;

/**
 * Valida segmentos de origen no confiable (IPC): cada uno un rango finito con `end > start ≥ 0`,
 * redondeado a centésimas y ordenado por inicio. Devuelve `undefined` si no hay array, si algún
 * rango es inválido, o si la duración conservada no llega al mínimo (→ el export cae al rango simple).
 */
export function normalizeSegments(input: unknown): Segment[] | undefined {
  if (!Array.isArray(input) || input.length === 0) return undefined;
  const out: Segment[] = [];
  for (const item of input) {
    if (typeof item !== 'object' || item === null) return undefined;
    const { start, end } = item as Record<string, unknown>;
    if (typeof start !== 'number' || !Number.isFinite(start) || start < 0) return undefined;
    if (typeof end !== 'number' || !Number.isFinite(end) || end <= start) return undefined;
    out.push({ start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100 });
  }
  out.sort((a, b) => a.start - b.start);
  if (keptDuration(out) < EXPORT_MIN_SECONDS) return undefined;
  return out;
}

/**
 * Valida un request de origen no confiable (IPC). Lanza con mensaje claro si algo
 * no cierra; devuelve el request tipado y con números redondeados a centésimas.
 */
export function normalizeExportRequest(input: unknown): ExportRequest {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Pedido de exportación inválido.');
  }
  const raw = input as Record<string, unknown>;

  const clipId = raw.clipId;
  if (typeof clipId !== 'number' || !Number.isInteger(clipId) || clipId <= 0) {
    throw new Error('Id de clip inválido.');
  }
  const start = raw.startSeconds;
  const end = raw.endSeconds;
  if (typeof start !== 'number' || !Number.isFinite(start) || start < 0) {
    throw new Error('Inicio de recorte inválido.');
  }
  if (typeof end !== 'number' || !Number.isFinite(end)) {
    throw new Error('Fin de recorte inválido.');
  }
  if (end - start < EXPORT_MIN_SECONDS) {
    throw new Error(`El recorte debe durar al menos ${EXPORT_MIN_SECONDS} s.`);
  }
  const format = raw.format;
  if (format !== 'mp4' && format !== 'gif') {
    throw new Error('Formato de exportación inválido.');
  }
  const quality = raw.quality;
  if (quality !== 'alta' && quality !== 'media' && quality !== 'baja') {
    throw new Error('Calidad de exportación inválida.');
  }

  return {
    clipId,
    startSeconds: Math.round(start * 100) / 100,
    endSeconds: Math.round(end * 100) / 100,
    format,
    quality,
    ...('mutedTracks' in raw ? { mutedTracks: normalizeMutedTracks(raw.mutedTracks) } : {}),
    ...('trackVolumes' in raw ? { trackVolumes: normalizeTrackVolumes(raw.trackVolumes) } : {}),
    ...(normalizeSegments(raw.segments) ? { segments: normalizeSegments(raw.segments) } : {}),
    ...reframeFields(raw),
  };
}

/**
 * Campos de reencuadre normalizados, solo si reencuadra de verdad (aspecto ≠ `original`) y llegan
 * dimensiones de fuente válidas. Sin eso, no se añade `reframe` y el render va por la ruta de siempre.
 */
function reframeFields(raw: Record<string, unknown>): Partial<ExportRequest> {
  if (!('reframe' in raw)) return {};
  const reframe = normalizeReframe(raw.reframe);
  if (!hasReframe(reframe)) return {};
  const w = raw.sourceWidth;
  const h = raw.sourceHeight;
  if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) return {};
  if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) return {};
  return { reframe, sourceWidth: Math.round(w), sourceHeight: Math.round(h) };
}
