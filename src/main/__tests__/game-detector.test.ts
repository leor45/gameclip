import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameDetector } from '../capture/game-detector';

// El sondeo es async: tras avanzar el timer hay que drenar las microtareas pendientes.
async function avanzar(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

describe('GameDetector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function crear(procesosPorSondeo: string[][]) {
    let i = 0;
    const detector = new GameDetector({
      listProcessNames: () => {
        const lista = procesosPorSondeo[Math.min(i, procesosPorSondeo.length - 1)];
        i++;
        return Promise.resolve(lista);
      },
      intervalMs: 1000,
      missesBeforeStop: 2,
    });
    const eventos: string[] = [];
    detector.on('game-started', (g: string) => eventos.push(`started:${g}`));
    detector.on('game-stopped', () => eventos.push('stopped'));
    return { detector, eventos };
  }

  it('emite game-started al detectar un juego y no lo repite mientras siga', async () => {
    const { detector, eventos } = crear([[], ['cs2.exe'], ['cs2.exe'], ['cs2.exe']]);
    detector.start();
    await avanzar(0); // primer sondeo inmediato (sin juego)
    expect(eventos).toEqual([]);

    await avanzar(1000);
    expect(eventos).toEqual(['started:Counter-Strike 2']);
    expect(detector.currentGame).toBe('Counter-Strike 2');

    await avanzar(2000); // sigue corriendo: sin eventos nuevos
    expect(eventos).toEqual(['started:Counter-Strike 2']);
    detector.stop();
  });

  it('game-started incluye el ejecutable real que matcheó (no un alias del juego)', async () => {
    const { detector } = crear([['cs2.exe']]);
    const matches: Array<{ game: string; exe: string }> = [];
    detector.on('game-started', (game: string, exe: string) => matches.push({ game, exe }));
    detector.start();
    await avanzar(0);
    // 'Counter-Strike 2' tiene dos exes conocidos (csgo/cs2): debe emitir el que corre.
    expect(matches).toEqual([{ game: 'Counter-Strike 2', exe: 'cs2.exe' }]);
    detector.stop();
  });

  it('espera 2 sondeos sin ver el juego antes de emitir game-stopped (anti-parpadeo)', async () => {
    const { detector, eventos } = crear([['cs2.exe'], [], ['cs2.exe'], [], []]);
    detector.start();
    await avanzar(0);
    expect(eventos).toEqual(['started:Counter-Strike 2']);

    // Un sondeo sin el proceso (parpadeo) no lo da por cerrado…
    await avanzar(1000);
    expect(eventos).toEqual(['started:Counter-Strike 2']);
    // …y al reaparecer se resetea el contador.
    await avanzar(1000);
    expect(eventos).toEqual(['started:Counter-Strike 2']);

    // Dos sondeos consecutivos sin verlo: ahora sí.
    await avanzar(2000);
    expect(eventos).toEqual(['started:Counter-Strike 2', 'stopped']);
    expect(detector.currentGame).toBeNull();
    detector.stop();
  });

  it('detecta el cambio de un juego a otro como nuevo game-started', async () => {
    const { detector, eventos } = crear([['cs2.exe'], ['RocketLeague.exe']]);
    detector.start();
    await avanzar(0);
    await avanzar(1000);
    expect(eventos).toEqual(['started:Counter-Strike 2', 'started:Rocket League']);
    detector.stop();
  });

  it('stop() corta el sondeo y un fallo del listador no cambia el estado', async () => {
    let llamadas = 0;
    const detector = new GameDetector({
      listProcessNames: () => {
        llamadas++;
        return llamadas === 2 ? Promise.reject(new Error('tasklist falló')) : Promise.resolve(['cs2']);
      },
      intervalMs: 1000,
    });
    detector.start();
    await avanzar(0);
    expect(detector.currentGame).toBe('Counter-Strike 2');

    await avanzar(1000); // sondeo que falla: se ignora
    expect(detector.currentGame).toBe('Counter-Strike 2');

    detector.stop();
    const antes = llamadas;
    await avanzar(5000);
    expect(llamadas).toBe(antes);
  });
});
