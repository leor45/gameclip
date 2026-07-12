import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { FfmpegProcess } from '../export/spawn';
import { parseAudioTracks, probeAudioTracks } from '../export/probe';

// Salida real de `ffmpeg -i` sobre un clip con el layout por rol (modo apps + separadas).
const SALIDA_POR_ROL = `
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'C:\\Videos\\GameClip\\clip.mp4':
  Metadata:
    major_brand     : isom
  Duration: 00:00:45.03, start: 0.000000, bitrate: 15234 kb/s
  Stream #0:0[0x1](und): Video: h264 (High), yuv420p, 2560x1440, 60 fps, 60 tbr
    Metadata:
      handler_name    : VideoHandler
  Stream #0:1[0x2](und): Audio: aac (LC), 48000 Hz, stereo, fltp, 162 kb/s
    Metadata:
      title           : default
      handler_name    : default
  Stream #0:2[0x3](und): Audio: aac (LC), 48000 Hz, stereo, fltp, 162 kb/s
    Metadata:
      title           : game
      handler_name    : game
  Stream #0:3[0x4](und): Audio: aac (LC), 48000 Hz, stereo, fltp, 162 kb/s
    Metadata:
      title           : mic
      handler_name    : mic
  Stream #0:4[0x5](und): Audio: aac (LC), 48000 Hz, stereo, fltp, 162 kb/s
    Metadata:
      title           : opera
      handler_name    : opera
At least one output file must be specified
`;

const SALIDA_UNA_PISTA = `
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'clip.mp4':
  Stream #0:0[0x1](und): Video: h264 (High), yuv420p, 1920x1080, 60 fps
    Metadata:
      handler_name    : VideoHandler
  Stream #0:1[0x2](und): Audio: aac (LC), 48000 Hz, stereo, fltp, 160 kb/s
    Metadata:
      handler_name    : SoundHandler
`;

class FakeFfmpeg extends EventEmitter implements FfmpegProcess {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill(): boolean {
    return true;
  }
}

describe('parseAudioTracks', () => {
  it('lee las pistas nombradas con su ordinal de audio (no el del stream)', () => {
    // El video es el stream 0, así que la mezcla es a:0 y las fuentes a:1…a:3.
    expect(parseAudioTracks(SALIDA_POR_ROL)).toEqual([
      { index: 0, name: 'default' },
      { index: 1, name: 'game' },
      { index: 2, name: 'mic' },
      { index: 3, name: 'opera' },
    ]);
  });

  it('un handler genérico del muxer no cuenta como nombre', () => {
    expect(parseAudioTracks(SALIDA_UNA_PISTA)).toEqual([{ index: 0, name: null }]);
  });

  it('sin pistas de audio devuelve lista vacía', () => {
    expect(parseAudioTracks('Stream #0:0: Video: h264\n')).toEqual([]);
    expect(parseAudioTracks('')).toEqual([]);
  });
});

describe('probeAudioTracks', () => {
  it('sondea con `-i` y parsea el stderr', async () => {
    const fake = new FakeFfmpeg();
    const spawnFn = vi.fn().mockReturnValue(fake);

    const promesa = probeAudioTracks(spawnFn, 'C:\\ffmpeg.exe', 'C:\\clip.mp4');
    fake.stderr.emit('data', SALIDA_POR_ROL);
    fake.emit('close', 1); // ffmpeg sin archivo de salida termina con 1: es lo normal aquí

    expect(await promesa).toHaveLength(4);
    expect(spawnFn).toHaveBeenCalledWith('C:\\ffmpeg.exe', [
      '-hide_banner',
      '-i',
      'C:\\clip.mp4',
    ]);
  });

  it('si ffmpeg no arranca, devuelve lista vacía en vez de romper el editor', async () => {
    const tracks = await probeAudioTracks(
      () => {
        throw new Error('ENOENT');
      },
      'C:\\no-existe.exe',
      'C:\\clip.mp4',
    );
    expect(tracks).toEqual([]);
  });
});
