import { describe, expect, it } from 'vitest';
import {
  KNOWN_GAME_PROCESSES,
  findRunningGame,
  findRunningGamesMatch,
  isManualGame,
} from '../games';

describe('findRunningGame', () => {
  it('encuentra un juego conocido entre procesos comunes', () => {
    const procesos = ['explorer.exe', 'chrome.exe', 'VALORANT-Win64-Shipping.exe', 'code.exe'];
    expect(findRunningGame(procesos)).toBe('Valorant');
  });

  it('acepta nombres sin .exe y en cualquier capitalización', () => {
    expect(findRunningGame(['CS2'])).toBe('Counter-Strike 2');
    expect(findRunningGame(['RocketLeague'])).toBe('Rocket League');
    expect(findRunningGame(['eldenring.EXE'])).toBe('Elden Ring');
  });

  it('devuelve null sin coincidencias o con lista vacía', () => {
    expect(findRunningGame(['explorer.exe', 'svchost.exe'])).toBeNull();
    expect(findRunningGame([])).toBeNull();
    expect(findRunningGame(['', '   '])).toBeNull();
  });

  it('la lista curada usa claves normalizadas (minúsculas, sin .exe)', () => {
    for (const key of Object.keys(KNOWN_GAME_PROCESSES)) {
      expect(key).toBe(key.toLowerCase());
      expect(key.endsWith('.exe')).toBe(false);
    }
  });
});

describe('findRunningGamesMatch (multi-juego)', () => {
  it('devuelve TODOS los juegos conocidos en ejecución, en orden de aparición', () => {
    const procesos = [
      'explorer.exe',
      'cs2.exe',
      'chrome.exe',
      'RocketLeague.exe',
      'VALORANT-Win64-Shipping.exe',
    ];
    expect(findRunningGamesMatch(procesos)).toEqual([
      { name: 'Counter-Strike 2', executable: 'cs2.exe' },
      { name: 'Rocket League', executable: 'rocketleague.exe' },
      { name: 'Valorant', executable: 'valorant-win64-shipping.exe' },
    ]);
  });

  it('combina la lista curada con los ejecutables manuales', () => {
    const procesos = ['MiJuego.exe', 'cs2.exe'];
    expect(findRunningGamesMatch(procesos, ['MiJuego.exe'])).toEqual([
      { name: 'MiJuego', executable: 'mijuego.exe' },
      { name: 'Counter-Strike 2', executable: 'cs2.exe' },
    ]);
  });

  it('el nombre visible de un juego manual sale de su entrada en customGames (sin extensión)', () => {
    // El nombre conserva la capitalización de lo escrito por el usuario, no la del proceso.
    expect(findRunningGamesMatch(['Otro.exe'], ['Otro'])).toEqual([
      { name: 'Otro', executable: 'otro.exe' },
    ]);
    expect(findRunningGamesMatch(['Otro.exe'], ['otro'])).toEqual([
      { name: 'otro', executable: 'otro.exe' },
    ]);
  });

  it('acepta procesos y manuales sin .exe y en cualquier capitalización', () => {
    expect(findRunningGamesMatch(['CS2'], [])).toEqual([
      { name: 'Counter-Strike 2', executable: 'cs2.exe' },
    ]);
    // Matchea sin importar la capitalización; el nombre visible es el de customGames.
    expect(findRunningGamesMatch(['JUEGO'], ['Juego.EXE'])).toEqual([
      { name: 'Juego', executable: 'juego.exe' },
    ]);
  });

  it('deduplica por nombre visible cuando varios exes mapean al mismo juego', () => {
    // csgo y cs2 son ambos 'Counter-Strike 2': solo aparece una vez (el primero visto).
    const resultado = findRunningGamesMatch(['csgo.exe', 'cs2.exe']);
    expect(resultado).toEqual([{ name: 'Counter-Strike 2', executable: 'csgo.exe' }]);
  });

  it('devuelve lista vacía sin coincidencias', () => {
    expect(findRunningGamesMatch(['explorer.exe', 'svchost.exe'])).toEqual([]);
    expect(findRunningGamesMatch([])).toEqual([]);
  });
});

describe('isManualGame', () => {
  it('es manual si su nombre coincide con un ejecutable de la lista del usuario', () => {
    expect(isManualGame('MiJuego', ['MiJuego.exe'])).toBe(true);
    expect(isManualGame('mijuego', ['MIJUEGO.EXE'])).toBe(true); // NTFS ignora la capitalización
  });

  it('un juego de la lista curada no es manual', () => {
    expect(isManualGame('Terraria', ['MiJuego.exe'])).toBe(false);
    expect(isManualGame('Terraria', [])).toBe(false);
  });

  it('sin juego activo no hay nada que marcar', () => {
    expect(isManualGame(null, ['MiJuego.exe'])).toBe(false);
  });
});
