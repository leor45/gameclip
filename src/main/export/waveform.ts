import type { SpawnFfmpeg } from './spawn';

/** Frecuencia del PCM que decodificamos solo para dibujar la onda: mono y baja, es barato. */
export const WAVEFORM_SAMPLE_RATE = 8000;

/** Picos por defecto de una onda (resolución horizontal del canvas). */
export const WAVEFORM_BUCKETS = 400;

/** Máxima amplitud de una muestra int16 (para normalizar a 0..1). */
const INT16_PEAK = 32768;

/**
 * Reduce un PCM mono `s16le` a `buckets` picos normalizados `0..1`. Puro y testeable: cada pico es
 * el máximo |amplitud| de su tramo, dividido por el rango de int16.
 */
export function reducePeaks(pcm: Int16Array, buckets: number): number[] {
  if (buckets <= 0) return [];
  const peaks = new Array<number>(buckets).fill(0);
  if (pcm.length === 0) return peaks;
  const perBucket = pcm.length / buckets;
  for (let i = 0; i < buckets; i++) {
    const start = Math.floor(i * perBucket);
    const end = Math.min(pcm.length, Math.floor((i + 1) * perBucket));
    let max = 0;
    for (let j = start; j < end; j++) {
      const a = Math.abs(pcm[j]);
      if (a > max) max = a;
    }
    peaks[i] = Math.min(1, max / INT16_PEAK);
  }
  return peaks;
}

/** Interpreta un Buffer de bytes `s16le` (little-endian) como muestras int16. */
export function pcmToInt16(buf: Buffer): Int16Array {
  const usable = buf.length - (buf.length % 2); // descarta un byte suelto al final
  const out = new Int16Array(usable / 2);
  for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(i * 2);
  return out;
}

/** Args de ffmpeg para volcar UNA pista a PCM mono `s16le` por stdout. */
export function waveformArgs(inputPath: string, trackIndex: number): string[] {
  return [
    '-hide_banner',
    '-nostdin',
    '-i',
    inputPath,
    '-map',
    `0:a:${trackIndex}`,
    '-ac',
    '1',
    '-ar',
    String(WAVEFORM_SAMPLE_RATE),
    '-f',
    's16le',
    'pipe:1',
  ];
}

/**
 * Extrae la onda (picos `0..1`) de una pista de un clip. Best-effort: si ffmpeg no arranca o
 * termina mal, devuelve `[]` y la UI dibuja la pista sin onda. Es lo único que puede sacar una onda
 * **por pista** (el navegador solo decodifica la mezcla `default`).
 */
export function extractWaveform(
  spawnFn: SpawnFfmpeg,
  ffmpegPath: string,
  inputPath: string,
  trackIndex: number,
  buckets: number = WAVEFORM_BUCKETS,
): Promise<number[]> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnFn(ffmpegPath, waveformArgs(inputPath, trackIndex));
    } catch {
      return resolve([]);
    }
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
    child.on('error', () => resolve([]));
    child.on('close', (code) => {
      if (code !== 0) return resolve([]);
      try {
        resolve(reducePeaks(pcmToInt16(Buffer.concat(chunks)), buckets));
      } catch {
        resolve([]);
      }
    });
  });
}
