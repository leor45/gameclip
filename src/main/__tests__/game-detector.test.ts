import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomGame, GameIndex, RunningGameMatch } from '@shared/games';
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

  function crear(procesosPorSondeo: string[][], customGames: CustomGame[] = []) {
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
    const { detector, emisiones } = crear(
      [['MiJuego.exe', 'explorer.exe']],
      [{ executable: 'MiJuego.exe' }],
    );
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

    detector.setCustomGames([{ executable: 'MiJuego.exe' }]);
    await avanzar(1000);
    expect(nombres(emisiones)).toEqual([['MiJuego']]);
    detector.stop();
  });

  it('detecta un juego instalado en cuanto el índice de launchers llega (regresión)', async () => {
    // Arc Raiders arranca `pioneergame.exe`: no está en la lista curada ni lo añadió nadie a mano.
    const { detector, emisiones } = crear([['PioneerGame.exe'], ['PioneerGame.exe']]);
    detector.start();
    await avanzar(0);
    expect(emisiones).toEqual([]); // sin índice, la app es ciega: el bug que arreglamos

    detector.setIndex({ pioneergame: 'ARC Raiders' });
    await avanzar(1000);
    expect(emisiones[0]).toEqual([{ name: 'ARC Raiders', executable: 'pioneergame.exe' }]);
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

describe('GameDetector — re-índice por novedad (unknown-executable)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function crear(
    procesosPorSondeo: string[][],
    opts: { cooldownMs?: number; customGames?: CustomGame[]; index?: GameIndex } = {},
  ) {
    let i = 0;
    const detector = new GameDetector({
      listProcessNames: () => {
        const lista = procesosPorSondeo[Math.min(i, procesosPorSondeo.length - 1)];
        i++;
        return Promise.resolve(lista);
      },
      intervalMs: 1000,
      missesBeforeStop: 2,
      customGames: opts.customGames,
      index: opts.index,
      unknownRefreshCooldownMs: opts.cooldownMs ?? 0,
    });
    let unknowns = 0;
    detector.on('unknown-executable', () => {
      unknowns++;
    });
    return { detector, contar: () => unknowns };
  }

  it('un proceso nuevo no reconocido tras la línea base pide re-índice (regresión)', async () => {
    // 2XKO (Riot) arranca `Lion.exe`: no está en la lista curada ni en el índice viejo. Se instaló y
    // lanzó con la app abierta; hoy no se detecta hasta reiniciar. El detector debe pedir re-índice.
    const { detector, contar } = crear([['explorer.exe'], ['explorer.exe', 'Lion.exe']]);
    detector.start();
    await avanzar(0); // primera pasada: solo línea base
    expect(contar()).toBe(0);

    await avanzar(1000); // Lion.exe: nuevo y desconocido → dispara
    expect(contar()).toBe(1);
    detector.stop();
  });

  it('la primera pasada solo fija la línea base: no dispara aunque haya desconocidos', async () => {
    const { detector, contar } = crear([['explorer.exe', 'random.exe', 'otra.exe']]);
    detector.start();
    await avanzar(0);
    expect(contar()).toBe(0);
    detector.stop();
  });

  it('un proceso reconocido (curada / índice / manual) no pide re-índice', async () => {
    const { detector, contar } = crear(
      [['explorer.exe'], ['explorer.exe', 'cs2.exe', 'pioneergame.exe', 'MiJuego.exe']],
      { index: { pioneergame: 'ARC Raiders' }, customGames: [{ executable: 'MiJuego.exe' }] },
    );
    detector.start();
    await avanzar(0);
    await avanzar(1000); // cs2 (curada), pioneergame (índice), MiJuego (manual): todos reconocidos
    expect(contar()).toBe(0);
    detector.stop();
  });

  it('un desconocido que ya disparó no vuelve a disparar mientras siga corriendo', async () => {
    const { detector, contar } = crear([
      ['explorer.exe'],
      ['explorer.exe', 'foo.exe'],
      ['explorer.exe', 'foo.exe'],
    ]);
    detector.start();
    await avanzar(0); // línea base
    await avanzar(1000); // foo nuevo → dispara
    expect(contar()).toBe(1);
    await avanzar(1000); // foo ya visto → no dispara
    expect(contar()).toBe(1);
    detector.stop();
  });

  it('cooldown: dos desconocidos seguidos → un emit; el pendiente dispara al expirar', async () => {
    const { detector, contar } = crear(
      [
        ['explorer.exe'],
        ['explorer.exe', 'foo.exe'],
        ['explorer.exe', 'foo.exe', 'bar.exe'],
        ['explorer.exe', 'foo.exe', 'bar.exe'],
      ],
      { cooldownMs: 5000 },
    );
    detector.start();
    await avanzar(0); // t=0 línea base
    await avanzar(1000); // t=1000 foo nuevo → emit (1)
    expect(contar()).toBe(1);
    await avanzar(1000); // t=2000 bar nuevo pero dentro del cooldown → pendiente, no emit
    expect(contar()).toBe(1);
    await avanzar(1000); // t=3000 sigue en cooldown, sin nuevos → pendiente sigue
    expect(contar()).toBe(1);
    await avanzar(3000); // t=6000 cooldown cumplido (desde t=1000) y pendiente → emit (2)
    expect(contar()).toBe(2);
    detector.stop();
  });
});
