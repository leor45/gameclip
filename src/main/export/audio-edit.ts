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

/** Reintentos del rename y espera entre ellos; inyectables en tests. */
export interface AudioEditDeps {
  rename?: (from: string, to: string) => void;
  sleep?: (ms: number) => Promise<void>;
}

/** Cuántas veces se reintenta el rename y cuánto se espera entre intentos (backoff lineal). */
const RENAME_ATTEMPTS = 6;
const RENAME_DELAY_MS = 150;

/** Códigos con los que Windows avisa de que el archivo está tomado por alguien. */
const BLOQUEADO = new Set(['EPERM', 'EACCES', 'EBUSY']);

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
  deps: AudioEditDeps = {},
): Promise<void> {
  const tmp = join(dirname(file), `.gameclip-edit-${process.pid}-${Date.now()}.mp4`);
  try {
    const { code, stderr } = await runFfmpeg(
      spawnFn,
      ffmpegPath,
      buildAudioEditArgs({ inputPath: file, outputPath: tmp, tracks, activeTracks }),
    );
    if (code !== 0) throw new Error(lastLine(stderr) || `ffmpeg terminó con código ${code}.`);
    await renameWithRetry(tmp, file, deps);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * Renombra reintentando mientras el destino esté tomado. Windows **no deja renombrar sobre un
 * archivo abierto**, y el clip lo tiene abierto la propia app mientras el reproductor del editor lo
 * está leyendo (protocolo de medios con `stream`). El editor lo suelta antes de guardar, pero cerrar
 * el handle es asíncrono; los reintentos cubren esa ventana — y de paso los bloqueos ajenos y
 * transitorios (indexador de Windows, antivirus).
 */
async function renameWithRetry(from: string, to: string, deps: AudioEditDeps): Promise<void> {
  const rename = deps.rename ?? renameSync;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  for (let intento = 1; intento <= RENAME_ATTEMPTS; intento++) {
    try {
      rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (!BLOQUEADO.has(code)) throw err;
      if (intento === RENAME_ATTEMPTS) {
        // El EPERM crudo no le dice nada al usuario; el motivo real sí.
        throw new Error(
          'El archivo del clip está en uso y no se pudo reemplazar. Cerrá el clip en otro ' +
            'reproductor (o esperá unos segundos) y volvé a intentar.',
        );
      }
      await sleep(RENAME_DELAY_MS * intento);
    }
  }
}

function lastLine(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines[lines.length - 1] ?? '';
}
