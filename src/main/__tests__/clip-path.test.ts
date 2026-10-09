import { describe, expect, it } from 'vitest';
import { isInsideDir } from '../library/clip-path';

describe('isInsideDir — ¿cuelga el archivo de la carpeta?', () => {
  it('un archivo de la carpeta, o de cualquiera de sus subcarpetas, está dentro', () => {
    expect(isInsideDir('D:\\Clips', 'D:\\Clips\\a.mp4')).toBe(true);
    expect(isInsideDir('D:\\Clips', 'D:\\Clips\\Fortnite\\Capturas\\a.png')).toBe(true);
  });

  it('no distingue mayúsculas (NTFS)', () => {
    expect(isInsideDir('D:\\Clips', 'd:\\CLIPS\\Fortnite\\a.mp4')).toBe(true);
    expect(isInsideDir('d:\\clips', 'D:\\Clips\\A.mp4')).toBe(true);
  });

  it('da igual la barra, y la barra final de la carpeta', () => {
    expect(isInsideDir('D:/Clips', 'D:\\Clips\\a.mp4')).toBe(true);
    expect(isInsideDir('D:\\Clips', 'D:/Clips/Fortnite/a.mp4')).toBe(true);
    expect(isInsideDir('D:\\Clips\\', 'D:\\Clips\\a.mp4')).toBe(true);
    expect(isInsideDir('D:\\Clips//', 'D:\\Clips\\a.mp4')).toBe(true);
  });

  it('una carpeta hermana con el mismo prefijo en el nombre NO es la carpeta', () => {
    expect(isInsideDir('D:\\Clips', 'D:\\Clips2\\a.mp4')).toBe(false);
    expect(isInsideDir('D:\\Clips', 'D:\\Clips copia\\a.mp4')).toBe(false);
  });

  it('un archivo cuyo nombre empieza por «..» sigue estando dentro', () => {
    expect(isInsideDir('D:\\Clips', 'D:\\Clips\\..raro.mp4')).toBe(true);
  });

  it('la propia carpeta, su padre y otra rama no cuentan como dentro', () => {
    expect(isInsideDir('D:\\Clips', 'D:\\Clips')).toBe(false);
    expect(isInsideDir('D:\\Clips', 'D:\\Clips\\')).toBe(false);
    expect(isInsideDir('D:\\Clips', 'D:\\a.mp4')).toBe(false);
    expect(isInsideDir('D:\\Clips', 'D:\\Otra\\a.mp4')).toBe(false);
  });

  it('otra unidad no es dentro, ni siquiera con la misma ruta', () => {
    expect(isInsideDir('D:\\Clips', 'E:\\Clips\\a.mp4')).toBe(false);
    expect(isInsideDir('E:\\', 'D:\\Clips\\a.mp4')).toBe(false);
  });

  it('la raíz de una unidad contiene todo lo de la unidad (no se recorta a «D:»)', () => {
    expect(isInsideDir('D:\\', 'D:\\a.mp4')).toBe(true);
    expect(isInsideDir('D:\\', 'D:\\Clips\\Fortnite\\a.mp4')).toBe(true);
    expect(isInsideDir('d:/', 'D:\\Clips\\a.mp4')).toBe(true);
    expect(isInsideDir('D:\\', 'E:\\a.mp4')).toBe(false);
  });

  it('rutas UNC: por recurso, sin mayúsculas, con la raíz del recurso como carpeta', () => {
    expect(isInsideDir('\\\\nas\\recurso\\Clips', '\\\\NAS\\Recurso\\Clips\\a.mp4')).toBe(true);
    expect(isInsideDir('//nas/recurso/Clips/', '\\\\nas\\recurso\\Clips\\Fortnite\\a.mp4')).toBe(
      true,
    );
    expect(isInsideDir('\\\\nas\\recurso', '\\\\nas\\recurso\\Clips\\a.mp4')).toBe(true);
    expect(isInsideDir('\\\\nas\\recurso\\', '\\\\nas\\recurso\\a.mp4')).toBe(true);
    // Otro recurso del mismo servidor, y otro servidor.
    expect(isInsideDir('\\\\nas\\recurso', '\\\\nas\\otro\\a.mp4')).toBe(false);
    expect(isInsideDir('\\\\nas\\recurso', '\\\\otro\\recurso\\a.mp4')).toBe(false);
    // Un recurso de red y una unidad local nunca son lo mismo para este helper.
    expect(isInsideDir('\\\\nas\\recurso\\Clips', 'Z:\\Clips\\a.mp4')).toBe(false);
  });

  it('el prefijo \\\\?\\ de un lado no esconde que el archivo cuelga de la carpeta', () => {
    expect(isInsideDir('D:\\Clips', '\\\\?\\D:\\Clips\\largo.mp4')).toBe(true);
    expect(isInsideDir('\\\\?\\D:\\Clips', 'D:\\Clips\\largo.mp4')).toBe(true);
    expect(isInsideDir('D:\\Clips', '\\\\?\\D:\\Otra\\largo.mp4')).toBe(false);
    expect(isInsideDir('\\\\nas\\recurso\\Clips', '\\\\?\\UNC\\nas\\recurso\\Clips\\a.mp4')).toBe(
      true,
    );
  });

  it('una carpeta vacía no contiene nada (no se resuelve contra el directorio de trabajo)', () => {
    expect(isInsideDir('', 'D:\\Clips\\a.mp4')).toBe(false);
    expect(isInsideDir('   ', 'a.mp4')).toBe(false);
  });
});
