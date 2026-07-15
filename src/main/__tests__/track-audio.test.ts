import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { SpawnFfmpeg } from '../export/spawn';
import { extractTrackAudio, trackAudioArgs } from '../export/track-audio';

describe('trackAudioArgs', () => {
  it('vuelca una sola pista a AAC/ADTS por stdout', () => {
    const args = trackAudioArgs('C:\\clip.mp4', 2);
    expect(args.join(' ')).toContain('-map 0:a:2');
    expect(args.join(' ')).toContain('-c:a aac');
    expect(args.join(' ')).toContain('-f adts');
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

describe('extractTrackAudio', () => {
  it('junta el stdout y resuelve con los bytes de la pista', async () => {
    const spawn = childDriver((child) => {
      child.stdout.emit('data', Buffer.from([0xff, 0xf1]));
      child.stdout.emit('data', Buffer.from([0x50, 0x80]));
      child.emit('close', 0);
    });
    const out = await extractTrackAudio(spawn, 'ffmpeg', 'clip.mp4', 1);
    expect(Array.from(out)).toEqual([0xff, 0xf1, 0x50, 0x80]);
  });

  it('si ffmpeg termina con código !=0, devuelve un Buffer vacío (best-effort)', async () => {
    const spawn = childDriver((child) => {
      child.stdout.emit('data', Buffer.from([0x01]));
      child.emit('close', 1);
    });
    expect((await extractTrackAudio(spawn, 'ffmpeg', 'clip.mp4', 1)).length).toBe(0);
  });

  it('si el proceso falla o no arranca, devuelve un Buffer vacío', async () => {
    const spawnError = childDriver((child) => child.emit('error', new Error('boom')));
    expect((await extractTrackAudio(spawnError, 'ffmpeg', 'clip.mp4', 1)).length).toBe(0);

    const spawnThrows = (() => {
      throw new Error('no ffmpeg');
    }) as unknown as SpawnFfmpeg;
    expect((await extractTrackAudio(spawnThrows, 'ffmpeg', 'clip.mp4', 1)).length).toBe(0);
  });
});
