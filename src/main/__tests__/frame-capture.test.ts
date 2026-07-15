import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { LibraryManager } from '../library/manager';
import { saveClipFrame } from '../capture/frame-capture';

describe('saveClipFrame', () => {
  it('decodifica el PNG, lo escribe en Capturas y lo registra en la biblioteca', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'frame-'));
    const register = vi.fn().mockResolvedValue({});
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const pngBase64 = 'data:image/png;base64,' + png.toString('base64');

    const path = await saveClipFrame({
      outputDir: dir,
      gameName: 'ARC Raiders',
      pngBase64,
      library: { registerSavedClip: register } as unknown as LibraryManager,
    });

    expect(path).not.toBeNull();
    expect(existsSync(path!)).toBe(true);
    expect(readFileSync(path!)).toEqual(png); // bytes idénticos al PNG de origen
    expect(path).toContain('Capturas'); // carpeta de capturas del juego
    expect(path!.endsWith('.png')).toBe(true);
    expect(register).toHaveBeenCalledWith(path, 'scan', 'ARC Raiders');
  });

  it('acepta el base64 sin el prefijo data: y sirve para clips sin juego', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'frame-'));
    const register = vi.fn().mockResolvedValue({});
    const png = Buffer.from([1, 2, 3, 4]);

    const path = await saveClipFrame({
      outputDir: dir,
      gameName: null,
      pngBase64: png.toString('base64'),
      library: { registerSavedClip: register } as unknown as LibraryManager,
    });

    expect(path).not.toBeNull();
    expect(readFileSync(path!)).toEqual(png);
    expect(register).toHaveBeenCalledWith(path, 'scan', null);
  });

  it('un PNG vacío no escribe nada y devuelve null', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'frame-'));
    const register = vi.fn();

    const path = await saveClipFrame({
      outputDir: dir,
      gameName: null,
      pngBase64: 'data:image/png;base64,',
      library: { registerSavedClip: register } as unknown as LibraryManager,
    });

    expect(path).toBeNull();
    expect(register).not.toHaveBeenCalled();
  });
});
