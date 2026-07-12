// Dominio de exportación de clips: tipos y validación pura (sin Electron ni ffmpeg).

import { normalizeMutedTracks } from './tracks';

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
  };
}
