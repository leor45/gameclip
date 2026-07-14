import type { ExportFormat, ExportQuality } from '@shared/export';
import type { TrackGain } from '@shared/tracks';

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
  /**
   * Ganancia por pista (editor avanzado): cada fuente se atenúa/amplifica antes de mezclarse.
   * Tiene precedencia sobre `audioTracks`. Ganancia 0 = pista fuera de la mezcla; todas en 0 → sin
   * audio.
   */
  audioGains?: TrackGain[];
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
      ...audioArgs(job),
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
 * Filtro que aplica **ganancia por pista** (`volume=g`) antes de sumarlas (`amix`, `normalize=0`,
 * igual que el mixer de libobs). Las pistas con ganancia 0 quedan fuera. Con una sola activa no hay
 * `amix`: se le aplica el `volume` directamente. Lanza si no queda ninguna activa (el llamador debe
 * haber cortado a `-an` antes).
 */
export function gainMixFilter(gains: TrackGain[], label: string): string {
  const activos = gains.filter((g) => g.gain > 0);
  if (activos.length === 0) throw new Error('gainMixFilter: no hay pistas activas.');
  const fmt = (g: number): string => String(Math.round(g * 1000) / 1000);
  if (activos.length === 1) {
    return `[0:a:${activos[0].index}]volume=${fmt(activos[0].gain)}[${label}]`;
  }
  const cadenas = activos.map((g, i) => `[0:a:${g.index}]volume=${fmt(g.gain)}[g${i}]`);
  const entradas = activos.map((_, i) => `[g${i}]`).join('');
  return `${cadenas.join(';')};${entradas}amix=inputs=${activos.length}:normalize=0[${label}]`;
}

/**
 * Mapeo del audio del MP4 exportado. Precedencia: `audioGains` (editor avanzado, con volumen por
 * pista) → `audioTracks` (editor simple, mute on/off) → sin selección (ffmpeg elige la pista).
 * Sin pistas marcadas / todas en 0 → sin audio.
 */
function audioArgs(job: FfmpegJob): string[] {
  const codec = ['-c:a', 'aac', '-b:a', AUDIO_BITRATE];

  if (job.audioGains !== undefined) {
    if (job.audioGains.filter((g) => g.gain > 0).length === 0) return ['-an'];
    return ['-filter_complex', gainMixFilter(job.audioGains, 'aout'), '-map', '0:v:0', '-map', '[aout]', ...codec]; // prettier-ignore
  }

  const audioTracks = job.audioTracks;
  if (audioTracks === undefined) return codec;
  if (audioTracks.length === 0) return ['-an'];
  if (audioTracks.length === 1) {
    return ['-map', '0:v:0', '-map', `0:a:${audioTracks[0]}`, ...codec];
  }
  return ['-filter_complex', amixFilter(audioTracks, 'aout'), '-map', '0:v:0', '-map', '[aout]', ...codec]; // prettier-ignore
}
