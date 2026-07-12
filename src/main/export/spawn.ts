import { spawn } from 'node:child_process';

// Superficie mínima del proceso de ffmpeg, para inyectar uno falso en tests.
export interface FfmpegProcess {
  stdout: NodeJS.EventEmitter;
  stderr: NodeJS.EventEmitter;
  on(event: 'error', listener: (err: Error) => void): unknown;
  on(event: 'close', listener: (code: number | null) => void): unknown;
  kill(signal?: NodeJS.Signals): unknown;
}

export type SpawnFfmpeg = (command: string, args: string[]) => FfmpegProcess;

export const defaultSpawn: SpawnFfmpeg = (command, args) =>
  spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

/** Corre ffmpeg hasta el final; devuelve el código de salida y el stderr acumulado. */
export function runFfmpeg(
  spawnFn: SpawnFfmpeg,
  ffmpegPath: string,
  args: string[],
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    let child: FfmpegProcess;
    try {
      child = spawnFn(ffmpegPath, args);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr }));
  });
}
