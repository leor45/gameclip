import type { ClipAudioTrack } from '@shared/tracks';
import { runFfmpeg, type SpawnFfmpeg } from './spawn';

// Handlers que escriben los muxers por defecto: son ruido, no un nombre de pista.
const GENERIC_HANDLERS = new Set([
  'soundhandler',
  'sound media handler',
  'core media audio',
  'gpac iso audio handler',
]);

const STREAM_LINE = /^Stream #\d+:\d+.*?:\s*(Audio|Video|Subtitle|Data)\b/i;
const META_LINE = /^(title|handler_name)\s*:\s*(.+)$/i;

/**
 * Pistas de audio a partir del stderr de `ffmpeg -i <clip>` (ffmpeg sin salida termina con
 * código 1 y vuelca ahí la info del archivo). El `index` es el ordinal de audio (a:0, a:1, …),
 * que es lo que consumen `-map` y los filtros; los nombres los embebe nuestro remux de la
 * captura (`title` + `handler_name`).
 */
export function parseAudioTracks(stderr: string): ClipAudioTrack[] {
  const tracks: ClipAudioTrack[] = [];
  let abierta: ClipAudioTrack | null = null;
  let title: string | null = null;
  let handler: string | null = null;

  const cerrar = (): void => {
    if (abierta) {
      abierta.name = pickName(title, handler);
      tracks.push(abierta);
    }
    abierta = null;
    title = null;
    handler = null;
  };

  for (const raw of stderr.split(/\r?\n/)) {
    const line = raw.trim();
    const stream = STREAM_LINE.exec(line);
    if (stream) {
      cerrar();
      // El ordinal de audio es la cantidad de pistas de audio ya vistas.
      if (stream[1].toLowerCase() === 'audio') abierta = { index: tracks.length, name: null };
      continue;
    }
    if (/^(Input|Output) #/.test(line)) {
      cerrar();
      continue;
    }
    if (!abierta) continue;
    const meta = META_LINE.exec(line);
    if (meta) {
      const valor = meta[2].trim();
      if (meta[1].toLowerCase() === 'title') title = valor;
      else handler = valor;
    }
  }
  cerrar();
  return tracks;
}

function pickName(title: string | null, handler: string | null): string | null {
  if (title) return title;
  if (handler && !GENERIC_HANDLERS.has(handler.toLowerCase())) return handler;
  return null;
}

/** Sondea las pistas de audio de un clip. Best-effort: si ffmpeg no arranca, devuelve []. */
export async function probeAudioTracks(
  spawnFn: SpawnFfmpeg,
  ffmpegPath: string,
  file: string,
): Promise<ClipAudioTrack[]> {
  try {
    const { stderr } = await runFfmpeg(spawnFn, ffmpegPath, ['-hide_banner', '-i', file]);
    return parseAudioTracks(stderr);
  } catch {
    return [];
  }
}
