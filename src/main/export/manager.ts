import { EventEmitter } from 'node:events';
import { rmSync } from 'node:fs';
import type { ExportResult } from '@shared/export';
import type { ClipAudioTrack } from '@shared/tracks';
import { runAudioEdit } from './audio-edit';
import { buildFfmpegArgs, type FfmpegJob } from './ffmpeg-args';
import { probeAudioTracks } from './probe';
import { defaultSpawn, type FfmpegProcess, type SpawnFfmpeg } from './spawn';

export type { FfmpegProcess, SpawnFfmpeg } from './spawn';

/**
 * Corre ffmpeg sobre los clips: exportar recortes (una exportación a la vez, progreso por evento
 * 'progress' 0–1, cancelación con limpieza del parcial), sondear las pistas de audio y reescribir
 * la mezcla de un clip (guardar edit).
 */
export class ExportManager extends EventEmitter {
  private current: FfmpegProcess | null = null;
  private canceled = false;
  private editing = false;

  constructor(
    private readonly ffmpegPath: string,
    private readonly spawnFn: SpawnFfmpeg = defaultSpawn,
  ) {
    super();
  }

  get isBusy(): boolean {
    return this.current !== null || this.editing;
  }

  /** Pistas de audio de un clip (índice + nombre embebido). */
  probeTracks(file: string): Promise<ClipAudioTrack[]> {
    return probeAudioTracks(this.spawnFn, this.ffmpegPath, file);
  }

  /**
   * Reescribe la mezcla del clip in-place con las pistas marcadas. Lanza si ffmpeg falla (el
   * archivo original queda intacto).
   */
  async saveAudioEdit(
    file: string,
    tracks: ClipAudioTrack[],
    activeTracks: number[],
  ): Promise<void> {
    this.editing = true;
    try {
      await runAudioEdit(this.spawnFn, this.ffmpegPath, file, tracks, activeTracks);
    } finally {
      this.editing = false;
    }
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
