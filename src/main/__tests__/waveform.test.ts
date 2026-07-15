import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { SpawnFfmpeg } from '../export/spawn';
import {
  extractWaveform,
  pcmToInt16,
  reducePeaks,
  waveformArgs,
  WAVEFORM_SAMPLE_RATE,
} from '../export/waveform';

describe('reducePeaks', () => {
  it('reduce a N picos con el máximo |amplitud| de cada tramo, normalizado', () => {
    const pcm = Int16Array.from([0, 16384, -32768, 8192]);
    expect(reducePeaks(pcm, 2)).toEqual([0.5, 1]);
  });

  it('PCM vacío devuelve ceros; buckets<=0 devuelve []', () => {
    expect(reducePeaks(new Int16Array(0), 3)).toEqual([0, 0, 0]);
    expect(reducePeaks(Int16Array.from([1, 2, 3]), 0)).toEqual([]);
  });

  it('acota a 1 (el mínimo int16 es -32768)', () => {
    expect(reducePeaks(Int16Array.from([-32768]), 1)).toEqual([1]);
  });
});

describe('pcmToInt16', () => {
  it('interpreta bytes s16le little-endian y descarta un byte suelto', () => {
    // 0x4000 = 16384, 0x8000 = -32768
    expect(Array.from(pcmToInt16(Buffer.from([0x00, 0x40, 0x00, 0x80])))).toEqual([16384, -32768]);
    expect(pcmToInt16(Buffer.from([0x00, 0x40, 0x7f])).length).toBe(1); // el 0x7f suelto se ignora
  });
});

describe('waveformArgs', () => {
  it('vuelca una sola pista a PCM mono s16le por stdout', () => {
    const args = waveformArgs('C:\\clip.mp4', 2);
    expect(args.join(' ')).toContain('-map 0:a:2');
    expect(args.join(' ')).toContain(`-ar ${WAVEFORM_SAMPLE_RATE}`);
    expect(args).toContain('s16le');
    expect(args[args.length - 1]).toBe('pipe:1');
  });
});

function childDriver(drive: (child: EventEmitter & { stdout: EventEmitter }) => void): SpawnFfmpeg {
  return (() => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: () => {},
    });
    setImmediate(() => drive(child));
    return child;
  }) as unknown as SpawnFfmpeg;
}

describe('extractWaveform', () => {
  it('junta el stdout, lo reduce a picos y resuelve', async () => {
    const pcm = Buffer.from([0x00, 0x40, 0x00, 0x80]); // 16384, -32768
    const spawn = childDriver((child) => {
      child.stdout.emit('data', pcm);
      child.emit('close', 0);
    });
    expect(await extractWaveform(spawn, 'ffmpeg', 'clip.mp4', 1, 2)).toEqual([0.5, 1]);
  });

  it('si ffmpeg termina con código !=0, devuelve [] (best-effort)', async () => {
    const spawn = childDriver((child) => child.emit('close', 1));
    expect(await extractWaveform(spawn, 'ffmpeg', 'clip.mp4', 1)).toEqual([]);
  });

  it('si el proceso falla o no arranca, devuelve []', async () => {
    const spawnError = childDriver((child) => child.emit('error', new Error('boom')));
    expect(await extractWaveform(spawnError, 'ffmpeg', 'clip.mp4', 1)).toEqual([]);

    const spawnThrows = (() => {
      throw new Error('no ffmpeg');
    }) as unknown as SpawnFfmpeg;
    expect(await extractWaveform(spawnThrows, 'ffmpeg', 'clip.mp4', 1)).toEqual([]);
  });
});
