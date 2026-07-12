import { describe, expect, it } from 'vitest';
import {
  clipBaseName,
  clipFileName,
  clipFolderSegments,
  clipTimestamp,
} from '../clip-naming';

// 2 de julio de 2026, 10:02:01.010 → centésimas 01
const FECHA = new Date(2026, 6, 2, 10, 2, 1, 10);

describe('clipBaseName', () => {
  it('quita la extensión del ejecutable', () => {
    expect(clipBaseName('Terraria.exe')).toBe('Terraria');
    expect(clipBaseName('rocketleague.exe')).toBe('rocketleague');
    expect(clipBaseName('Among Us.exe')).toBe('Among Us'); // los espacios se conservan
  });

  it('sin juego (o con un nombre que queda vacío) es Desktop', () => {
    expect(clipBaseName(null)).toBe('Desktop');
    expect(clipBaseName('')).toBe('Desktop');
    expect(clipBaseName('???.exe')).toBe('Desktop');
  });

  it('limpia los caracteres que Windows no admite en rutas', () => {
    expect(clipBaseName('Half-Life 2: Ep1.exe')).toBe('Half-Life 2 Ep1');
  });
});

describe('clipTimestamp', () => {
  it('usa AAAA.MM.DD - HH.MM.SS.CC con centésimas', () => {
    expect(clipTimestamp(FECHA)).toBe('2026.07.02 - 10.02.01.01');
    expect(clipTimestamp(new Date(2025, 11, 22, 20, 47, 50, 789))).toBe(
      '2025.12.22 - 20.47.50.78',
    );
  });
});

describe('clipFileName', () => {
  it('nombra el video con el juego y la marca de tiempo', () => {
    expect(
      clipFileName({ gameExecutable: 'Terraria.exe', date: FECHA, kind: 'video', extension: 'mp4' }),
    ).toBe('Terraria 2026.07.02 - 10.02.01.01.mp4');
  });

  it('la captura lleva Screenshot entre el juego y la marca', () => {
    expect(
      clipFileName({
        gameExecutable: null,
        date: new Date(2025, 11, 22, 20, 47, 50, 789),
        kind: 'screenshot',
        extension: '.png',
      }),
    ).toBe('Desktop Screenshot 2025.12.22 - 20.47.50.78.png');
  });
});

describe('clipFolderSegments', () => {
  it('el video va en la carpeta del juego y la captura en su subcarpeta Capturas', () => {
    expect(clipFolderSegments('Terraria.exe', 'video')).toEqual(['Terraria']);
    expect(clipFolderSegments('Terraria.exe', 'screenshot')).toEqual(['Terraria', 'Capturas']);
    expect(clipFolderSegments(null, 'video')).toEqual(['Desktop']);
    expect(clipFolderSegments(null, 'screenshot')).toEqual(['Desktop', 'Capturas']);
  });
});
