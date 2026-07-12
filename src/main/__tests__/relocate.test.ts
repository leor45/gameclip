import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { relocateSavedFile, targetPathFor, uniquePath } from '../capture/relocate';

const dir = mkdtempSync(join(tmpdir(), 'gameclip-relocate-'));
const salida = join(dir, 'clips');

afterAll(() => rmSync(dir, { recursive: true, force: true }));

beforeEach(() => {
  rmSync(salida, { recursive: true, force: true });
  mkdirSync(salida, { recursive: true });
});

const FECHA = new Date(2026, 6, 2, 10, 2, 1, 10);

describe('targetPathFor', () => {
  it('el clip va a la carpeta del juego', () => {
    const ruta = targetPathFor({
      outputDir: 'D:\\Clips',
      gameExecutable: 'Terraria.exe',
      date: FECHA,
      kind: 'video',
      extension: 'mp4',
    });
    expect(ruta).toBe('D:\\Clips\\Terraria\\Terraria 2026.07.02 - 10.02.01.01.mp4');
  });

  it('sin juego va a Desktop, y la captura a su subcarpeta Capturas', () => {
    expect(
      targetPathFor({
        outputDir: 'D:\\Clips',
        gameExecutable: null,
        date: FECHA,
        kind: 'screenshot',
        extension: 'png',
      }),
    ).toBe('D:\\Clips\\Desktop\\Capturas\\Desktop Screenshot 2026.07.02 - 10.02.01.01.png');
  });
});

describe('uniquePath', () => {
  it('desambigua con (2), (3)… si el destino está ocupado', () => {
    const ocupados = new Set(['C:\\a\\clip.mp4', 'C:\\a\\clip (2).mp4']);
    expect(uniquePath('C:\\a\\clip.mp4', (p) => ocupados.has(p))).toBe('C:\\a\\clip (3).mp4');
    expect(uniquePath('C:\\a\\libre.mp4', (p) => ocupados.has(p))).toBe('C:\\a\\libre.mp4');
  });
});

describe('relocateSavedFile', () => {
  it('mueve el archivo a su carpeta definitiva y la crea si no existe', () => {
    const origen = join(salida, 'crudo-de-libobs.mp4');
    writeFileSync(origen, 'video');
    const destino = join(salida, 'Terraria', 'Terraria 2026.07.02 - 10.02.01.01.mp4');

    const final = relocateSavedFile(origen, destino);

    expect(final).toBe(destino);
    expect(readFileSync(destino, 'utf8')).toBe('video');
    expect(existsSync(origen)).toBe(false);
  });

  it('no pisa un archivo existente en el destino', () => {
    const destino = join(salida, 'Terraria', 'clip.mp4');
    mkdirSync(join(salida, 'Terraria'), { recursive: true });
    writeFileSync(destino, 'el-viejo');
    const origen = join(salida, 'nuevo.mp4');
    writeFileSync(origen, 'el-nuevo');

    const final = relocateSavedFile(origen, destino);

    expect(final).toBe(join(salida, 'Terraria', 'clip (2).mp4'));
    expect(readFileSync(destino, 'utf8')).toBe('el-viejo'); // intacto
    expect(readFileSync(final, 'utf8')).toBe('el-nuevo');
  });

  it('si no se puede mover, devuelve la ruta original (el clip nunca se pierde)', () => {
    const inexistente = join(salida, 'no-existe.mp4');

    expect(relocateSavedFile(inexistente, join(salida, 'Terraria', 'x.mp4'))).toBe(inexistente);
  });
});
