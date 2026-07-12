import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { ClipAudioTrack } from '@shared/tracks';
import { buildAudioEditArgs, runAudioEdit } from '../export/audio-edit';
import type { FfmpegProcess } from '../export/spawn';

const dir = mkdtempSync(join(tmpdir(), 'gameclip-edit-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const tracks: ClipAudioTrack[] = [
  { index: 0, name: 'default' },
  { index: 1, name: 'game' },
  { index: 2, name: 'mic' },
  { index: 3, name: 'opera' },
];

class FakeFfmpeg extends EventEmitter implements FfmpegProcess {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill(): boolean {
    return true;
  }
}

/** El error que tira Windows al renombrar sobre un archivo que otro proceso tiene abierto. */
function eperm(from: string, to: string): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error(
    `EPERM: operation not permitted, rename '${from}' -> '${to}'`,
  );
  err.code = 'EPERM';
  return err;
}

function args(activeTracks: number[]): string[] {
  return buildAudioEditArgs({
    inputPath: 'C:\\clip.mp4',
    outputPath: 'C:\\tmp.mp4',
    tracks,
    activeTracks,
  });
}

describe('buildAudioEditArgs', () => {
  it('rehace la mezcla con las pistas marcadas y conserva TODAS las fuentes', () => {
    const a = args([1, 3]); // mic muteado

    expect(a[a.indexOf('-filter_complex') + 1]).toBe(
      '[0:a:1][0:a:3]amix=inputs=2:normalize=0:duration=longest[mix]',
    );
    // Salida: video + mezcla nueva + las tres fuentes (incluida la muteada: no se borra).
    expect(a.join(' ')).toContain('-map 0:v -map [mix] -map 0:a:1 -map 0:a:2 -map 0:a:3');
    // Solo la mezcla se re-codifica; video y fuentes se copian.
    expect(a.join(' ')).toContain('-c copy -c:a:0 aac');
  });

  it('renombra las pistas de la salida: mezcla + fuentes en orden', () => {
    const a = args([1, 2, 3]).join(' ');

    expect(a).toContain('-metadata:s:a:0 title=default');
    expect(a).toContain('-metadata:s:a:1 title=game');
    expect(a).toContain('-metadata:s:a:2 title=mic');
    expect(a).toContain('-metadata:s:a:3 title=opera');
  });

  it('con una sola pista marcada no hace falta mezclar', () => {
    expect(args([2])[args([2]).indexOf('-filter_complex') + 1]).toBe('[0:a:2]anull[mix]');
  });

  it('sin ninguna pista marcada, la mezcla queda en silencio (pero la pista sigue ahí)', () => {
    const a = args([]);
    expect(a[a.indexOf('-filter_complex') + 1]).toBe('[0:a:1]volume=0[mix]');
    expect(a.join(' ')).toContain('-map [mix] -map 0:a:1');
  });

  it('un clip sin fuentes no se puede editar', () => {
    expect(() =>
      buildAudioEditArgs({
        inputPath: 'C:\\clip.mp4',
        outputPath: 'C:\\tmp.mp4',
        tracks: [{ index: 0, name: null }],
        activeTracks: [],
      }),
    ).toThrow(/pistas de audio por rol/i);
  });
});

describe('runAudioEdit', () => {
  it('escribe un temporal y lo renombra sobre el clip (atómico)', async () => {
    const clip = join(dir, 'clip-ok.mp4');
    writeFileSync(clip, 'original');
    const fake = new FakeFfmpeg();
    const spawnFn = vi.fn().mockImplementation((_cmd: string, argv: string[]) => {
      writeFileSync(argv[argv.length - 1], 'reescrito'); // ffmpeg escribiendo el temporal
      setImmediate(() => fake.emit('close', 0));
      return fake;
    });

    await runAudioEdit(spawnFn, 'C:\\ffmpeg.exe', clip, tracks, [1, 3]);

    expect(readFileSync(clip, 'utf8')).toBe('reescrito');
    expect(readdirSync(dir).filter((f) => f.startsWith('.gameclip-edit-'))).toEqual([]);
  });

  // Regresión: Windows no deja renombrar sobre un archivo abierto, y el clip lo tiene abierto el
  // <video> del editor (protocolo de medios con stream). El rename fallaba con EPERM y el edit se
  // perdía; ahora se reintenta mientras el handle se suelta.
  it('regresión: un rename bloqueado (EPERM) se reintenta y el edit se aplica', async () => {
    const clip = join(dir, 'clip-bloqueado.mp4');
    writeFileSync(clip, 'original');
    const fake = new FakeFfmpeg();
    const spawnFn = vi.fn().mockImplementation((_cmd: string, argv: string[]) => {
      writeFileSync(argv[argv.length - 1], 'reescrito');
      setImmediate(() => fake.emit('close', 0));
      return fake;
    });
    // El primer intento encuentra el archivo tomado; para el segundo, el handle ya se soltó.
    let intentos = 0;
    const rename = vi.fn().mockImplementation((from: string, to: string) => {
      intentos++;
      if (intentos === 1) throw eperm(from, to);
      renameSync(from, to);
    });

    await runAudioEdit(spawnFn, 'C:\\ffmpeg.exe', clip, tracks, [1], {
      rename,
      sleep: () => Promise.resolve(),
    });

    expect(intentos).toBe(2);
    expect(readFileSync(clip, 'utf8')).toBe('reescrito');
    expect(readdirSync(dir).filter((f) => f.startsWith('.gameclip-edit-'))).toEqual([]);
  });

  it('si el archivo sigue bloqueado, avisa en español y el clip queda intacto', async () => {
    const clip = join(dir, 'clip-tomado.mp4');
    writeFileSync(clip, 'original');
    const fake = new FakeFfmpeg();
    const spawnFn = vi.fn().mockImplementation((_cmd: string, argv: string[]) => {
      writeFileSync(argv[argv.length - 1], 'reescrito');
      setImmediate(() => fake.emit('close', 0));
      return fake;
    });
    const rename = vi.fn().mockImplementation((from: string, to: string) => {
      throw eperm(from, to);
    });

    await expect(
      runAudioEdit(spawnFn, 'C:\\ffmpeg.exe', clip, tracks, [1], {
        rename,
        sleep: () => Promise.resolve(),
      }),
    ).rejects.toThrow(/en uso/i);

    expect(readFileSync(clip, 'utf8')).toBe('original');
    expect(readdirSync(dir).filter((f) => f.startsWith('.gameclip-edit-'))).toEqual([]);
  });

  it('si ffmpeg falla, el clip queda intacto y no sobra el temporal', async () => {
    const clip = join(dir, 'clip-falla.mp4');
    writeFileSync(clip, 'original');
    const fake = new FakeFfmpeg();
    const spawnFn = vi.fn().mockImplementation(() => {
      setImmediate(() => {
        fake.stderr.emit('data', 'Invalid data found when processing input\n');
        fake.emit('close', 1);
      });
      return fake;
    });

    await expect(runAudioEdit(spawnFn, 'C:\\ffmpeg.exe', clip, tracks, [1])).rejects.toThrow(
      /invalid data/i,
    );
    expect(readFileSync(clip, 'utf8')).toBe('original');
    expect(readdirSync(dir).filter((f) => f.startsWith('.gameclip-edit-'))).toEqual([]);
  });
});
