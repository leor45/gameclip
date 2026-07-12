import type { ExportFormat, ExportQuality } from '@shared/export';

export interface FfmpegJob {
  inputPath: string;
  outputPath: string;
  startSeconds: number;
  endSeconds: number;
  format: ExportFormat;
  quality: ExportQuality;
  /**
   * Ordinales (`0:a:N`) de las pistas a mezclar en el audio de la salida. Lista vacía → sin
   * audio. Sin definir → ffmpeg elige la pista por su cuenta (clips sin sondeo).
   */
  audioTracks?: number[];
}

// CRF de libx264 por preset (menor = mejor calidad).
const MP4_CRF: Record<ExportQuality, number> = { alta: 18, media: 23, baja: 28 };
// GIF: cuadros por segundo y ancho máximo por preset.
const GIF_FPS: Record<ExportQuality, number> = { alta: 20, media: 15, baja: 10 };
const GIF_WIDTH: Record<ExportQuality, number> = { alta: 640, media: 480, baja: 320 };

/**
 * Argumentos de ffmpeg para exportar un recorte. `-ss` va antes de `-i`: con reencode el
 * corte es exacto y el seek no decodifica todo lo previo. `-progress pipe:1` emite
 * `out_time_ms` por stdout para la barra de progreso.
 */
export function buildFfmpegArgs(job: FfmpegJob): string[] {
  const duration = job.endSeconds - job.startSeconds;
  const base = [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-ss',
    job.startSeconds.toFixed(2),
    '-t',
    duration.toFixed(2),
    '-i',
    job.inputPath,
  ];

  if (job.format === 'mp4') {
    return [
      ...base,
      ...audioArgs(job.audioTracks),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      String(MP4_CRF[job.quality]),
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      job.outputPath,
    ];
  }

  // GIF: no lleva audio, las pistas marcadas no aplican.
  const fps = GIF_FPS[job.quality];
  const width = GIF_WIDTH[job.quality];
  const filtro =
    `fps=${fps},scale=${width}:-1:flags=lanczos,` +
    'split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse';
  return [...base, '-filter_complex', filtro, '-loop', '0', '-progress', 'pipe:1', job.outputPath];
}

/** Bitrate del AAC de salida (export y mezcla de "guardar edit"). */
export const AUDIO_BITRATE = '160k';

/**
 * Filtro que suma varias pistas en una. `normalize=0` (suma cruda, sin dividir por el número de
 * entradas) es lo que hace el mixer de libobs al armar la pista `default`: con todas las pistas
 * marcadas, el resultado suena como el original. Con una sola entrada, `amix` no aporta nada:
 * pasa `anull`.
 */
export function amixFilter(audioTracks: number[], label: string): string {
  const entradas = audioTracks.map((i) => `[0:a:${i}]`).join('');
  const mezcla =
    audioTracks.length === 1
      ? 'anull'
      : `amix=inputs=${audioTracks.length}:normalize=0:duration=longest`;
  return `${entradas}${mezcla}[${label}]`;
}

/**
 * Mapeo del audio del MP4 exportado: sin pistas marcadas no hay audio; con una se mapea directo
 * y con varias se mezclan. Sin selección (undefined) se conserva el comportamiento previo:
 * ffmpeg elige la pista por su cuenta.
 */
function audioArgs(audioTracks: number[] | undefined): string[] {
  if (audioTracks === undefined) return ['-c:a', 'aac', '-b:a', AUDIO_BITRATE];
  if (audioTracks.length === 0) return ['-an'];
  const codec = ['-c:a', 'aac', '-b:a', AUDIO_BITRATE];
  if (audioTracks.length === 1) {
    return ['-map', '0:v:0', '-map', `0:a:${audioTracks[0]}`, ...codec];
  }
  return [
    '-filter_complex',
    amixFilter(audioTracks, 'aout'),
    '-map',
    '0:v:0',
    '-map',
    '[aout]',
    ...codec,
  ];
}
