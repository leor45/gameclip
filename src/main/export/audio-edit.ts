import { renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ClipAudioTrack } from '@shared/tracks';
import { DEFAULT_TRACK_NAME, trackLabel } from '@shared/tracks';
import { AUDIO_BITRATE, amixFilter } from './ffmpeg-args';
import { runFfmpeg, type SpawnFfmpeg } from './spawn';

export interface AudioEditJob {
  inputPath: string;
  outputPath: string;
  /** Todas las pistas del clip, en orden: la 0 es la mezcla `default`, las demás son las fuentes. */
  tracks: ClipAudioTrack[];
  /** Ordinales de las fuentes que quedan en la mezcla (subconjunto de `tracks.slice(1)`). */
  activeTracks: number[];
}

/**
 * Args para reescribir la mezcla de un clip sin tocar sus fuentes: la pista 1 (`default`) se
 * re-codifica como suma de las pistas marcadas, y video y pistas de rol se copian (`-c copy`).
 * Nada se borra: las pistas muteadas siguen en el archivo, así que el edit es reversible y
 * volver a guardar reconstruye la mezcla desde fuentes intactas (sin pérdida de generación).
 *
 * Sin ninguna pista marcada, la mezcla se genera silenciando una fuente (`volume=0`) — mantener
 * la pista 1 evita romper la estructura del archivo y los reproductores.
 */
export function buildAudioEditArgs(job: AudioEditJob): string[] {
  const fuentes = job.tracks.slice(1);
  if (fuentes.length === 0) throw new Error('El clip no tiene pistas de audio por rol.');

  const filtro =
    job.activeTracks.length > 0
      ? amixFilter(job.activeTracks, 'mix')
      : `[0:a:${fuentes[0].index}]volume=0[mix]`;

  const mapas = ['-map', '0:v', '-map', '[mix]'];
  for (const t of fuentes) mapas.push('-map', `0:a:${t.index}`);

  // Los nombres se reescriben en la salida: `-c copy` los arrastraría, pero la pista 1 es nueva
  // y hay que nombrarla igual. Orden de la salida: mezcla + fuentes en el orden del archivo.
  const nombres = [DEFAULT_TRACK_NAME, ...fuentes.map(trackLabel)];
  const meta: string[] = [];
  nombres.forEach((nombre, i) => {
    meta.push(`-metadata:s:a:${i}`, `title=${nombre}`);
    meta.push(`-metadata:s:a:${i}`, `handler_name=${nombre}`);
  });

  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-i',
    job.inputPath,
    '-filter_complex',
    filtro,
    ...mapas,
    '-c',
    'copy',
    '-c:a:0',
    'aac',
    '-b:a:0',
    AUDIO_BITRATE,
    ...meta,
    '-movflags',
    '+faststart',
    job.outputPath,
  ];
}

/**
 * Reescribe la mezcla del clip **en su sitio**: ffmpeg escribe un temporal y solo si termina bien
 * se renombra sobre el original (mismo volumen → atómico). Si algo falla, el clip queda intacto.
 */
export async function runAudioEdit(
  spawnFn: SpawnFfmpeg,
  ffmpegPath: string,
  file: string,
  tracks: ClipAudioTrack[],
  activeTracks: number[],
): Promise<void> {
  const tmp = join(dirname(file), `.gameclip-edit-${process.pid}-${Date.now()}.mp4`);
  try {
    const { code, stderr } = await runFfmpeg(
      spawnFn,
      ffmpegPath,
      buildAudioEditArgs({ inputPath: file, outputPath: tmp, tracks, activeTracks }),
    );
    if (code !== 0) throw new Error(lastLine(stderr) || `ffmpeg terminó con código ${code}.`);
    renameSync(tmp, file);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err instanceof Error ? err : new Error(String(err));
  }
}

function lastLine(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines[lines.length - 1] ?? '';
}
