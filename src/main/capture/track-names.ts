import { spawn } from 'node:child_process';
import { renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Pista de audio a nombrar en el MP4: `index` es el índice de pista de libobs (1-based). */
export interface NamedTrack {
  index: number;
  name: string;
}

// Superficie mínima del proceso hijo, para inyectar uno falso en tests.
export interface FfmpegChild {
  on(event: 'error', listener: (err: Error) => void): unknown;
  on(event: 'close', listener: (code: number | null) => void): unknown;
}
export type SpawnFfmpeg = (command: string, args: string[]) => FfmpegChild;

const defaultSpawn: SpawnFfmpeg = (command, args) =>
  spawn(command, args, { windowsHide: true, stdio: 'ignore' });

/**
 * Args de ffmpeg para reescribir los nombres de las pistas de audio sin recodificar
 * (`-c copy`). Las pistas se ordenan por índice y se mapean a los streams de audio del MP4
 * en ese orden (a:0, a:1, …); se setean `title` y `handler_name` (este último es el que los
 * lectores muestran de forma más fiable, verificado en el spike).
 */
export function buildTrackNameArgs(input: string, output: string, tracks: NamedTrack[]): string[] {
  const ordenadas = [...tracks].sort((a, b) => a.index - b.index);
  const meta: string[] = [];
  ordenadas.forEach((t, i) => {
    meta.push(`-metadata:s:a:${i}`, `title=${t.name}`);
    meta.push(`-metadata:s:a:${i}`, `handler_name=${t.name}`);
  });
  return ['-y', '-i', input, '-map', '0', '-c', 'copy', ...meta, output];
}

function runFfmpeg(spawnFn: SpawnFfmpeg, ffmpegPath: string, args: string[]): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawnFn(ffmpegPath, args);
    child.on('error', reject);
    child.on('close', (code) => resolve(code));
  });
}

/**
 * Reescribe en el propio MP4 los nombres de las pistas de audio (remux `-c copy` a un temporal
 * y rename atómico sobre el original). Best-effort: si algo falla, deja el clip íntegro sin
 * nombres y devuelve false. libobs no escribe estos nombres en el MP4 (spike 2026-07-11), por
 * eso se hace en post-proceso.
 */
export async function remuxAudioTrackNames(
  ffmpegPath: string,
  file: string,
  tracks: NamedTrack[],
  spawnFn: SpawnFfmpeg = defaultSpawn,
): Promise<boolean> {
  if (tracks.length === 0) return false;
  const tmp = join(dirname(file), `.gameclip-names-${process.pid}-${Date.now()}.mp4`);
  try {
    const code = await runFfmpeg(spawnFn, ffmpegPath, buildTrackNameArgs(file, tmp, tracks));
    if (code !== 0) {
      rmSync(tmp, { force: true });
      return false;
    }
    renameSync(tmp, file); // mismo volumen → atómico; no deja el clip a medias
    return true;
  } catch {
    rmSync(tmp, { force: true });
    return false;
  }
}
