import type { SpawnFfmpeg } from './spawn';

/**
 * Args de ffmpeg para volcar UNA pista de audio a AAC/ADTS por stdout. ADTS es *streamable* (a
 * diferencia de MP4, que necesita salida seekable para el `moov`) y Chromium/Electron ya decodifica
 * AAC —los clips son H.264+AAC y ya se reproducen—, así que el renderer puede pasarlo a
 * `decodeAudioData` tal cual.
 */
export function trackAudioArgs(inputPath: string, trackIndex: number): string[] {
  return [
    '-hide_banner',
    '-nostdin',
    '-i',
    inputPath,
    '-map',
    `0:a:${trackIndex}`,
    '-c:a',
    'aac',
    '-f',
    'adts',
    'pipe:1',
  ];
}

/**
 * Extrae los bytes de UNA pista de audio de un clip (AAC/ADTS), para reconstruir la mezcla en vivo en
 * el editor avanzado (Fase 2). Best-effort: si ffmpeg no arranca o termina mal, devuelve un `Buffer`
 * vacío y esa pista no suena (pero el editor sigue). Es lo único que puede sacar el audio **por
 * pista** (el navegador solo decodifica la mezcla `default`).
 */
export function extractTrackAudio(
  spawnFn: SpawnFfmpeg,
  ffmpegPath: string,
  inputPath: string,
  trackIndex: number,
): Promise<Buffer> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnFn(ffmpegPath, trackAudioArgs(inputPath, trackIndex));
    } catch {
      return resolve(Buffer.alloc(0));
    }
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
    child.on('error', () => resolve(Buffer.alloc(0)));
    child.on('close', (code) => {
      if (code !== 0) return resolve(Buffer.alloc(0));
      resolve(Buffer.concat(chunks));
    });
  });
}
