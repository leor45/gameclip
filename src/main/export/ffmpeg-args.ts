import type { ExportFormat, ExportQuality } from '@shared/export';

export interface FfmpegJob {
  inputPath: string;
  outputPath: string;
  startSeconds: number;
  endSeconds: number;
  format: ExportFormat;
  quality: ExportQuality;
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
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      String(MP4_CRF[job.quality]),
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      job.outputPath,
    ];
  }

  // GIF con paleta optimizada en un solo paso (palettegen + paletteuse).
  const fps = GIF_FPS[job.quality];
  const width = GIF_WIDTH[job.quality];
  const filtro =
    `fps=${fps},scale=${width}:-1:flags=lanczos,` +
    'split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse';
  return [...base, '-filter_complex', filtro, '-loop', '0', '-progress', 'pipe:1', job.outputPath];
}
