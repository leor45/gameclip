import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunningGameMatch } from '@shared/games';
import { GameDetector } from '../capture/game-detector';

// El sondeo es async: tras avanzar el timer hay que drenar las microtareas pendientes.
async function avanzar(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

/** Nombres de los juegos de cada emisión de 'games-changed', en orden. */
function nombres(emisiones: RunningGameMatch[][]): string[][] {
  return emisiones.map((lista) => lista.map((g) => g.name));
}

describe('GameDetector (multi-juego)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function crear(procesosPorSondeo: string[][], customGames: string[] = []) {
    let i = 0;
    const detector = new GameDetector({
      listProcessNames: () => {
        const lista = procesosPorSondeo[Math.min(i, procesosPorSondeo.length - 1)];
        i++;
        return Promise.resolve(lista);
      },
      intervalMs: 1000,
      missesBeforeStop: 2,
      customGames,
    });
    const emisiones: RunningGameMatch[][] = [];
    detector.on('games-changed', (lista: RunningGameMatch[]) => emisiones.push(lista));
    return { detector, emisiones };
  }

  it('emite games-changed al aparecer un juego y no repite mientras el conjunto no cambie', async () => {
    const { detector, emisiones } = crear([[], ['cs2.exe'], ['cs2.exe'], ['cs2.exe']]);
    detector.start();
    await avanzar(0); // primer sondeo inmediato (sin juego)
    expect(emisiones).toEqual([]);

    await avanzar(1000);
    expect(nombres(emisiones)).toEqual([['Counter-Strike 2']]);

    await avanzar(2000); // sigue igual: sin emisiones nuevas
    expect(nombres(emisiones)).toEqual([['Counter-Strike 2']]);
    detector.stop();
  });

  it('la lista incluye el ejecutable real que matcheó (no un alias del juego)', async () => {
    const { detector, emisiones } = crear([['cs2.exe']]);
    detector.start();
    await avanzar(0);
    expect(emisiones[0]).toEqual([{ name: 'Counter-Strike 2', executable: 'cs2.exe' }]);
    detector.stop();
  });

  it('rastrea varios juegos a la vez y emite el conjunto completo', async () => {
    const { detector, emisiones } = crear([['cs2.exe', 'RocketLeague.exe']]);
    detector.start();
    await avanzar(0);
    expect(nombres(emisiones)).toEqual([['Counter-Strike 2', 'Rocket League']]);
    detector.stop();
  });

  it('si un juego desaparece pero otro sigue, actualiza la lista de inmediato (sin debounce)', async () => {
    const { detector, emisiones } = crear([['cs2.exe', 'RocketLeague.exe'], ['cs2.exe']]);
    detector.start();
    await avanzar(0);
    await avanzar(1000);
    expect(nombres(emisiones)).toEqual([
      ['Counter-Strike 2', 'Rocket League'],
      ['Counter-Strike 2'],
    ]);
    detector.stop();
  });

  it('espera 2 sondeos sin ver NINGÚN juego antes de vaciar la lista (anti-parpadeo)', async () => {
    const { detector, emisiones } = crear([['cs2.exe'], [], ['cs2.exe'], [], []]);
    detector.start();
    await avanzar(0);
    expect(nombres(emisiones)).toEqual([['Counter-Strike 2']]);

    // Un sondeo sin ningún proceso (parpadeo) no vacía la lista…
    await avanzar(1000);
    expect(nombres(emisiones)).toEqual([['Counter-Strike 2']]);
    // …y al reaparecer se resetea el contador (mismo conjunto: sin emisión nueva).
    await avanzar(1000);
    expect(nombres(emisiones)).toEqual([['Counter-Strike 2']]);

    // Dos sondeos consecutivos sin ver nada: ahora sí se vacía.
    await avanzar(2000);
    expect(nombres(emisiones)).toEqual([['Counter-Strike 2'], []]);
    expect(detector.running).toEqual([]);
    detector.stop();
  });

  it('detecta ejecutables añadidos a mano (customGames) como juegos', async () => {
    const { detector, emisiones } = crear([['MiJuego.exe', 'explorer.exe']], ['MiJuego.exe']);
    detector.start();
    await avanzar(0);
    expect(emisiones[0]).toEqual([{ name: 'MiJuego', executable: 'mijuego.exe' }]);
    detector.stop();
  });

  it('setCustomGames aplica los nuevos manuales en el siguiente sondeo', async () => {
    const { detector, emisiones } = crear([['MiJuego.exe'], ['MiJuego.exe']]);
    detector.start();
    await avanzar(0);
    expect(emisiones).toEqual([]); // sin registrarlo, no es un juego

    detector.setCustomGames(['MiJuego.exe']);
    await avanzar(1000);
    expect(nombres(emisiones)).toEqual([['MiJuego']]);
    detector.stop();
  });

  it('stop() corta el sondeo y un fallo del listador no cambia el estado', async () => {
    let llamadas = 0;
    const detector = new GameDetector({
      listProcessNames: () => {
        llamadas++;
        return llamadas === 2
          ? Promise.reject(new Error('tasklist falló'))
          : Promise.resolve(['cs2']);
      },
      intervalMs: 1000,
    });
    detector.start();
    await avanzar(0);
    expect(nombres([detector.running])).toEqual([['Counter-Strike 2']]);

    await avanzar(1000); // sondeo que falla: se ignora
    expect(nombres([detector.running])).toEqual([['Counter-Strike 2']]);

    detector.stop();
    const antes = llamadas;
    await avanzar(5000);
    expect(llamadas).toBe(antes);
  });
});
