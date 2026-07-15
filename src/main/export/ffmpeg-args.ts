import type { ExportFormat, ExportQuality } from '@shared/export';
import {
  hasReframe,
  reframeGeometry,
  reframeVideoFilter,
  type Reframe,
  type ReframeGeometry,
} from '@shared/reframe';
import type { Segment } from '@shared/timeline';
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
  /**
   * Segmentos conservados (editor avanzado, Fase 3). Con **≥2** segmentos la salida es su
   * concatenación (ripple); con 1 (o sin definir) se usa la ruta rápida `-ss/-t` con
   * `startSeconds/endSeconds`. Solo MP4.
   */
  segments?: Segment[];
  /**
   * Reencuadre de vídeo (editor avanzado, Fase 4): relación de aspecto de salida + recorte/barras.
   * Con reencuadre activo el vídeo pasa por `filter_complex` (recorta/escala/rellena) en la ruta
   * simple y en la concat; sin reencuadre (o `original`) las rutas quedan intactas. Necesita
   * `sourceWidth/Height` para calcular la geometría en píxeles. Solo MP4.
   */
  reframe?: Reframe;
  /** Ancho/alto de la fuente en píxeles (para calcular la geometría del reencuadre). */
  sourceWidth?: number;
  sourceHeight?: number;
}

/**
 * Geometría del reencuadre del job, o `null` si no aplica (sin reframe, `original`, sin dimensiones de
 * la fuente, o formato no-MP4). Centraliza la condición para que ruta simple y concat coincidan.
 */
function jobReframeGeometry(job: FfmpegJob): ReframeGeometry | null {
  if (job.format !== 'mp4') return null;
  if (!job.reframe || !hasReframe(job.reframe)) return null;
  if (!job.sourceWidth || !job.sourceHeight) return null;
  return reframeGeometry(job.reframe, job.sourceWidth, job.sourceHeight);
}

// CRF de libx264 por preset (menor = mejor calidad).
const MP4_CRF: Record<ExportQuality, number> = { alta: 18, media: 23, baja: 28 };

/** Cola común del vídeo MP4: códec, preset, CRF por calidad, pixfmt, faststart y progreso. */
function mp4VideoTail(quality: ExportQuality): string[] {
  return [
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    String(MP4_CRF[quality]),
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
  ];
}
// GIF: cuadros por segundo y ancho máximo por preset.
const GIF_FPS: Record<ExportQuality, number> = { alta: 20, media: 15, baja: 10 };
const GIF_WIDTH: Record<ExportQuality, number> = { alta: 640, media: 480, baja: 320 };

/**
 * Argumentos de ffmpeg para exportar un recorte. `-ss` va antes de `-i`: con reencode el
 * corte es exacto y el seek no decodifica todo lo previo. `-progress pipe:1` emite
 * `out_time_ms` por stdout para la barra de progreso.
 */
export function buildFfmpegArgs(job: FfmpegJob): string[] {
  const geom = jobReframeGeometry(job);
  const vf = geom ? reframeVideoFilter(geom) : null;

  // Cortes múltiples (Fase 3): la salida concatena los segmentos conservados. Solo MP4; con 1
  // segmento cae a la ruta rápida `-ss/-t` de abajo. El reencuadre (Fase 4) se aplica antes del split.
  if (job.format === 'mp4' && job.segments && job.segments.length >= 2) {
    return buildConcatArgs(job, job.segments, vf);
  }

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
    // Con reencuadre (Fase 4) el vídeo pasa por el filtergraph (recorta/escala/rellena); el audio se
    // compone en el mismo `filter_complex`. Sin reencuadre, la ruta rápida de siempre queda intacta.
    if (vf) return buildReframedFastArgs(job, base, vf);
    return [
      ...base,
      ...audioArgs(job),
      ...mp4VideoTail(job.quality),
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

const secs = (x: number): string => x.toFixed(3);

/**
 * Cadena de filtro que produce la mezcla completa `[mixfull]` para la ruta de concatenación, o `null`
 * si la salida no lleva audio. Precedencia igual que `audioArgs`: `audioGains` (volumen por pista) →
 * `audioTracks` (mute on/off) → la primera pista. Todas las ganancias en 0 / sin pistas → sin audio.
 */
function concatAudioSource(job: FfmpegJob): string | null {
  if (job.audioGains !== undefined) {
    if (job.audioGains.filter((g) => g.gain > 0).length === 0) return null;
    return gainMixFilter(job.audioGains, 'mixfull');
  }
  const at = job.audioTracks;
  if (at === undefined) return '[0:a:0]anull[mixfull]';
  if (at.length === 0) return null;
  return amixFilter(at, 'mixfull');
}

/**
 * Args de ffmpeg para renderizar la **concatenación** de varios segmentos (Fase 3). Sin seek de
 * input: el vídeo se `split`ea en N, cada copia se recorta con `trim`+`setpts`; el audio arma la
 * mezcla completa, la duplica con `asplit=N` y recorta cada copia con `atrim`+`asetpts`; y `concat`
 * une los N pares. Sin audio activo, concatena solo vídeo y sale con `-an`. Con reencuadre (Fase 4,
 * `vf` no nulo) el vídeo se recorta/escala **una vez** antes del split, así los N segmentos parten de
 * la imagen ya reencuadrada.
 */
function buildConcatArgs(job: FfmpegJob, segments: Segment[], vf: string | null): string[] {
  const n = segments.length;
  const filters: string[] = [];

  // Vídeo: (reencuadre una vez →) split explícito en N y un trim+setpts por segmento.
  const vsrc = vf ? '[vr]' : '[0:v]';
  if (vf) filters.push(`[0:v]${vf}[vr]`);
  const vsplit = Array.from({ length: n }, (_, i) => `[vs${i}]`).join('');
  filters.push(`${vsrc}split=${n}${vsplit}`);
  for (let i = 0; i < n; i++) {
    filters.push(`[vs${i}]trim=start=${secs(segments[i].start)}:end=${secs(segments[i].end)},setpts=PTS-STARTPTS[v${i}]`); // prettier-ignore
  }

  const audioSource = concatAudioSource(job);
  if (audioSource) {
    filters.push(audioSource); // …[mixfull]
    const asplit = Array.from({ length: n }, (_, i) => `[as${i}]`).join('');
    filters.push(`[mixfull]asplit=${n}${asplit}`);
    for (let i = 0; i < n; i++) {
      filters.push(`[as${i}]atrim=start=${secs(segments[i].start)}:end=${secs(segments[i].end)},asetpts=PTS-STARTPTS[a${i}]`); // prettier-ignore
    }
    const pairs = Array.from({ length: n }, (_, i) => `[v${i}][a${i}]`).join('');
    filters.push(`${pairs}concat=n=${n}:v=1:a=1[vout][aout]`);
  } else {
    const vs = Array.from({ length: n }, (_, i) => `[v${i}]`).join('');
    filters.push(`${vs}concat=n=${n}:v=1:a=0[vout]`);
  }

  const maps = audioSource
    ? ['-map', '[vout]', '-map', '[aout]', '-c:a', 'aac', '-b:a', AUDIO_BITRATE]
    : ['-map', '[vout]', '-an'];

  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-i',
    job.inputPath,
    '-filter_complex',
    filters.join(';'),
    ...maps,
    ...mp4VideoTail(job.quality),
    job.outputPath,
  ];
}

/**
 * Ruta rápida `-ss/-t` **con reencuadre** (Fase 4): el vídeo se recorta/escala/rellena en un
 * `filter_complex` (`[0:v]<vf>[vout]`) y el audio se compone en el mismo grafo. Sustituye al mapeo
 * directo `0:v:0` de la ruta sin reencuadre. Un solo segmento (o recorte simple) sigue por aquí.
 */
function buildReframedFastArgs(job: FfmpegJob, base: string[], vf: string): string[] {
  const filters = [`[0:v]${vf}[vout]`];
  const audio = reframedAudioArgs(job, filters);
  return [
    ...base,
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[vout]',
    ...audio,
    ...mp4VideoTail(job.quality),
    job.outputPath,
  ];
}

/**
 * Mapeo/códec del audio para la ruta reencuadrada, empujando su cadena de filtro a `filters` (el
 * mismo `filter_complex` que el vídeo). Misma precedencia que `audioArgs`: `audioGains` → `audioTracks`
 * → audio del clip tal cual. Sin audio activo → `-an`.
 */
function reframedAudioArgs(job: FfmpegJob, filters: string[]): string[] {
  const codec = ['-c:a', 'aac', '-b:a', AUDIO_BITRATE];

  if (job.audioGains !== undefined) {
    if (job.audioGains.filter((g) => g.gain > 0).length === 0) return ['-an'];
    filters.push(gainMixFilter(job.audioGains, 'aout'));
    return ['-map', '[aout]', ...codec];
  }

  const at = job.audioTracks;
  // Sin selección: mapea la primera pista si existe (`?` la hace opcional; no se puede dejar que
  // ffmpeg auto-seleccione porque el `-map [vout]` del vídeo ya desactiva la selección automática).
  if (at === undefined) return ['-map', '0:a:0?', ...codec];
  if (at.length === 0) return ['-an'];
  if (at.length === 1) return ['-map', `0:a:${at[0]}`, ...codec];
  filters.push(amixFilter(at, 'aout'));
  return ['-map', '[aout]', ...codec];
}

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
