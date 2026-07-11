import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import type { ExportResult } from '@shared/export';
import { buildFfmpegArgs, type FfmpegJob } from './ffmpeg-args';

// Superficie mínima del proceso hijo, para inyectar uno falso en tests.
export interface FfmpegProcess {
  stdout: NodeJS.EventEmitter;
  stderr: NodeJS.EventEmitter;
  on(event: 'error', listener: (err: Error) => void): unknown;
  on(event: 'close', listener: (code: number | null) => void): unknown;
  kill(signal?: NodeJS.Signals): unknown;
}

export type SpawnFfmpeg = (command: string, args: string[]) => FfmpegProcess;

const defaultSpawn: SpawnFfmpeg = (command, args) =>
  spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

/**
 * Corre ffmpeg para exportar recortes: una exportación a la vez, progreso por evento
 * ('progress', 0–1), cancelación con limpieza del archivo parcial.
 */
export class ExportManager extends EventEmitter {
  private current: FfmpegProcess | null = null;
  private canceled = false;

  constructor(
    private readonly ffmpegPath: string,
    private readonly spawnFn: SpawnFfmpeg = defaultSpawn,
  ) {
    super();
  }

  get isBusy(): boolean {
    return this.current !== null;
  }

  run(job: FfmpegJob): Promise<ExportResult> {
    if (this.current) {
      return Promise.resolve({ status: 'error', message: 'Ya hay una exportación en curso.' });
    }
    this.canceled = false;

    let child: FfmpegProcess;
    try {
      child = this.spawnFn(this.ffmpegPath, buildFfmpegArgs(job));
    } catch (err) {
      return Promise.resolve({
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    this.current = child;

    const durationSeconds = job.endSeconds - job.startSeconds;
    let stderrTail = '';

    child.stdout.on('data', (chunk: Buffer | string) => {
      const ratio = parseProgress(String(chunk), durationSeconds);
      if (ratio !== null) this.emit('progress', { ratio });
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderrTail = (stderrTail + String(chunk)).slice(-2000);
    });

    return new Promise((resolve) => {
      child.on('error', (err) => {
        this.current = null;
        resolve({ status: 'error', message: `No se pudo ejecutar ffmpeg: ${err.message}` });
      });
      child.on('close', (code) => {
        const fueCancelado = this.canceled;
        this.current = null;
        if (fueCancelado) {
          this.removePartial(job.outputPath);
          resolve({ status: 'canceled' });
        } else if (code === 0) {
          this.emit('progress', { ratio: 1 });
          resolve({ status: 'done', outputPath: job.outputPath });
        } else {
          this.removePartial(job.outputPath);
          resolve({
            status: 'error',
            message: lastLine(stderrTail) || `ffmpeg terminó con código ${code}.`,
          });
        }
      });
    });
  }

  cancel(): void {
    if (!this.current) return;
    this.canceled = true;
    this.current.kill('SIGKILL');
  }

  private removePartial(path: string): void {
    try {
      rmSync(path, { force: true });
    } catch {
      // best-effort: un parcial huérfano no rompe nada
    }
  }
}

// ffmpeg emite bloques key=value; out_time_ms está en microsegundos (quirk conocido).
function parseProgress(chunk: string, durationSeconds: number): number | null {
  let lastUs: number | null = null;
  for (const line of chunk.split(/\r?\n/)) {
    const m = /^out_time_(?:us|ms)=(\d+)/.exec(line.trim());
    if (m) lastUs = Number(m[1]);
  }
  if (lastUs === null || durationSeconds <= 0) return null;
  return Math.min(1, lastUs / 1_000_000 / durationSeconds);
}

function lastLine(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines[lines.length - 1] ?? '';
}
