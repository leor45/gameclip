import { describe, expect, it } from 'vitest';
import {
  CLIP_BASE_MAX,
  clipBaseName,
  clipFileName,
  clipFolderSegments,
  clipTimestamp,
  gameFromFolderName,
} from '../clip-naming';

// 2 de julio de 2026, 10:02:01.010 → centésimas 01
const FECHA = new Date(2026, 6, 2, 10, 2, 1, 10);

describe('clipBaseName', () => {
  it('el nombre del juego es la base de la carpeta y del archivo', () => {
    expect(clipBaseName('Terraria')).toBe('Terraria');
    expect(clipBaseName('ARC Raiders')).toBe('ARC Raiders'); // los espacios se conservan
    expect(clipBaseName('Among Us')).toBe('Among Us');
  });

  it('tolera que le pasen un ejecutable: la extensión no se cuela en la carpeta', () => {
    expect(clipBaseName('Terraria.exe')).toBe('Terraria');
  });

  it('sin juego (o con un nombre que queda vacío al limpiarlo) es Desktop', () => {
    expect(clipBaseName(null)).toBe('Desktop');
    expect(clipBaseName('')).toBe('Desktop');
    expect(clipBaseName('???')).toBe('Desktop');
  });

  it('limpia los caracteres que Windows no admite, y conserva los que sí', () => {
    expect(clipBaseName('Half-Life 2: Ep1')).toBe('Half-Life 2 Ep1');
    // El apóstrofo y el guion son legales; solo cae el ':'.
    expect(clipBaseName("Marvel's Spider-Man: Miles Morales")).toBe(
      "Marvel's Spider-Man Miles Morales",
    );
    expect(clipBaseName('Pokémon Violeta')).toBe('Pokémon Violeta'); // los acentos también
  });

  it('quita los símbolos de marca que traen los catálogos', () => {
    expect(clipBaseName('DARK SOULS™: REMASTERED')).toBe('DARK SOULS REMASTERED');
    expect(clipBaseName('Rocket League®')).toBe('Rocket League');
  });

  it('nunca termina en punto ni en espacio (Windows los rechaza)', () => {
    expect(clipBaseName('Portal 2. ')).toBe('Portal 2');
    expect(clipBaseName('Juego...')).toBe('Juego');
  });

  it('no colisiona con un nombre de dispositivo reservado', () => {
    expect(clipBaseName('CON')).toBe('CON (juego)');
    expect(clipBaseName('nul')).toBe('nul (juego)');
    expect(clipBaseName('Conan Exiles')).toBe('Conan Exiles'); // solo el nombre exacto
  });

  it('acota la longitud, para no acercarse al límite de 260 de las rutas de Windows', () => {
    const largo = clipBaseName('X'.repeat(200));
    expect(largo.length).toBe(CLIP_BASE_MAX);
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
      clipFileName({ gameName: 'Terraria', date: FECHA, kind: 'video', extension: 'mp4' }),
    ).toBe('Terraria 2026.07.02 - 10.02.01.01.mp4');
  });

  it('la captura lleva Screenshot entre el juego y la marca', () => {
    expect(
      clipFileName({
        gameName: null,
        date: new Date(2025, 11, 22, 20, 47, 50, 789),
        kind: 'screenshot',
        extension: '.png',
      }),
    ).toBe('Desktop Screenshot 2025.12.22 - 20.47.50.78.png');
  });
});

describe('clipFolderSegments', () => {
  it('el video va en la carpeta del juego y la captura en su subcarpeta Capturas', () => {
    expect(clipFolderSegments('Terraria', 'video')).toEqual(['Terraria']);
    expect(clipFolderSegments('Terraria', 'screenshot')).toEqual(['Terraria', 'Capturas']);
    expect(clipFolderSegments(null, 'video')).toEqual(['Desktop']);
    expect(clipFolderSegments(null, 'screenshot')).toEqual(['Desktop', 'Capturas']);
  });
});

describe('gameFromFolderName', () => {
  const index = { acblackflag: "Assassin's Creed Black Flag Resynced", pioneergame: 'ARC Raiders' };

  it('traduce una carpeta VIEJA (el ejecutable) al nombre del juego', () => {
    expect(gameFromFolderName('terraria')).toBe('Terraria');
    expect(gameFromFolderName('cs2')).toBe('Counter-Strike 2');
  });

  it('una carpeta vieja de un juego que solo conoce el índice también se traduce', () => {
    // El clip ya grabado en `acblackflag/` pasa a verse con el nombre real, sin mover el fichero.
    expect(gameFromFolderName('acblackflag', { index })).toBe(
      "Assassin's Creed Black Flag Resynced",
    );
  });

  it('una carpeta NUEVA (el nombre saneado) recupera el nombre exacto del catálogo', () => {
    // Clave para no partir el juego en dos entradas: la carpeta nueva y la vieja deben resolver
    // al MISMO nombre, con sus ':' y demás.
    const index2 = { milesmorales: "Marvel's Spider-Man: Miles Morales" };
    expect(gameFromFolderName("Marvel's Spider-Man Miles Morales", { index: index2 })).toBe(
      "Marvel's Spider-Man: Miles Morales",
    );
    expect(gameFromFolderName('milesmorales', { index: index2 })).toBe(
      "Marvel's Spider-Man: Miles Morales",
    );
  });

  it('el nombre que puso el owner a mano manda sobre el del catálogo', () => {
    const customGames = [{ executable: 'pioneergame.exe', name: 'Arc' }];
    expect(gameFromFolderName('pioneergame', { customGames, index })).toBe('Arc');
  });

  it('Desktop no es un juego', () => {
    expect(gameFromFolderName('Desktop')).toBeNull();
    expect(gameFromFolderName('desktop')).toBeNull();
    expect(gameFromFolderName('  ')).toBeNull();
  });

  it('una carpeta desconocida (juego manual o hecha a mano) se toma tal cual', () => {
    expect(gameFromFolderName('MiJuegoRaro')).toBe('MiJuegoRaro');
  });
});
