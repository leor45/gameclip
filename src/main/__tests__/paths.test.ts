import { describe, expect, it } from 'vitest';
import { unpackedPath } from '../paths';

describe('unpackedPath', () => {
  it('reescribe una ruta dentro del asar a app.asar.unpacked', () => {
    expect(
      unpackedPath('C:\\GameClip\\resources\\app.asar\\node_modules\\ffmpeg-static\\ffmpeg.exe'),
    ).toBe('C:\\GameClip\\resources\\app.asar.unpacked\\node_modules\\ffmpeg-static\\ffmpeg.exe');
  });

  it('acepta separadores POSIX (Node normaliza rutas mezcladas en Windows)', () => {
    expect(unpackedPath('/opt/GameClip/resources/app.asar/node_modules/x')).toBe(
      '/opt/GameClip/resources/app.asar.unpacked/node_modules/x',
    );
  });

  it('deja intacta una ruta de desarrollo (sin asar)', () => {
    const dev = 'D:\\Projects\\gameclip\\node_modules\\@streamlabs\\obs-studio-node';
    expect(unpackedPath(dev)).toBe(dev);
  });

  it('no toca una carpeta que solo se parezca a app.asar', () => {
    const otra = 'C:\\cosas\\app.asarcopia\\x';
    expect(unpackedPath(otra)).toBe(otra);
  });

  it('ya reescrita, es idempotente', () => {
    const ya = 'C:\\GameClip\\resources\\app.asar.unpacked\\node_modules\\x';
    expect(unpackedPath(ya)).toBe(ya);
  });
});
