import { describe, expect, it } from 'vitest';
import { KNOWN_GAME_PROCESSES, findRunningGame } from '../games';

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
