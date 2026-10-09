import { basename } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomGame, GameIndex, RunningGameMatch } from '@shared/games';
import {
  GameDetector,
  createTasklistLister,
  parseTasklistCsv,
  tasklistCommand,
  type KillTree,
  type RunCommand,
} from '../capture/game-detector';

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

  it('un juego manual guardado con el nombre corrupto (antes de 0.9.8) se detecta y no pide re-índice (regresión B3-1)', async () => {
    const R = String.fromCharCode(0xfffd);
    const { detector, contar } = crear([['explorer.exe'], ['explorer.exe', 'pokémonñゲ.exe']], {
      customGames: [{ executable: `pok${R}mon${R}?.exe`, name: 'Pokémon' }],
    });
    detector.start();
    await avanzar(0);
    await avanzar(1000);
    expect(detector.running).toEqual([{ name: 'Pokémon', executable: 'pokémonñゲ.exe' }]);
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

describe('sondeo de procesos con tasklist (regresión D4-BUG-3: ejecutables con acentos, ñ o CJK)', () => {
  it('pone la consola en UTF-8 (chcp 65001) antes de tasklist', () => {
    // tasklist escribe en la codepage OEM de la consola (850 en un Windows en español) y Node decodifica
    // UTF-8: en `pingñé.exe` la ñ y la é llegaban como U+FFFD y `ゲーム.exe` como `???.exe` (medido), así
    // que un juego con un ejecutable no ASCII nunca se detectaba. `/d`, `>nul` y `&` (no `&&`): ver el
    // comentario de `tasklistCommand`.
    expect(tasklistCommand()).toEqual({
      file: 'cmd.exe',
      args: ['/d', '/s', '/c', 'chcp 65001>nul & tasklist /fo csv /nh'],
    });
  });

  it('parsea la primera columna del CSV, con CRLF y nombres no ASCII intactos', () => {
    const stdout =
      '"System Idle Process","0","Services","0","8 KB"\r\n' +
      '"pingñé.exe","1234","Console","1","5.120 KB"\r\n' +
      '"ゲーム.exe","5678","Console","1","9.000 KB"\r\n' +
      '"Marvel’s Spider-Man 2.exe","9012","Console","1","1 KB"\r\n' +
      '\r\n';
    expect(parseTasklistCsv(stdout)).toEqual([
      'System Idle Process',
      'pingñé.exe',
      'ゲーム.exe',
      'Marvel’s Spider-Man 2.exe',
    ]);
  });

  it('ignora líneas que no son filas del CSV', () => {
    expect(parseTasklistCsv('')).toEqual([]);
    expect(parseTasklistCsv('Página de códigos activa: 65001\r\n"cs2.exe","1"\r\n')).toEqual([
      'cs2.exe',
    ]);
  });

  it('un juego manual con ejecutable no ASCII se detecta si el nombre llega intacto', async () => {
    vi.useFakeTimers();
    try {
      const detector = new GameDetector({
        listProcessNames: () => Promise.resolve(parseTasklistCsv('"Pokémon ゲーム.exe","1"\r\n')),
        intervalMs: 1000,
        customGames: [{ executable: 'D:\\Juegos\\Pokémon ゲーム.exe', name: 'Pokémon' }],
      });
      const emisiones: RunningGameMatch[][] = [];
      detector.on('games-changed', (lista: RunningGameMatch[]) => emisiones.push(lista));
      detector.start();
      await avanzar(0);
      expect(nombres(emisiones)).toEqual([['Pokémon']]);
      detector.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it.skipIf(process.platform !== 'win32')(
    'en Windows lista los procesos reales (incluido este proceso de node)',
    async () => {
      const names = (await createTasklistLister()()).map((n) => n.toLowerCase());
      expect(names).toContain(basename(process.execPath).toLowerCase());
      expect(names).toContain('tasklist.exe');
    },
    15000,
  );
});

/** Proceso falso que devuelve el runner: el test decide si ya terminó (exitCode). */
interface ProcesoFalso {
  pid: number;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
}

/** Runner falso: guarda cada llamada para terminarla cuando el test quiera. */
function runnerFalso() {
  const llamadas: {
    file: string;
    args: string[];
    done: (err: Error | null, stdout: string) => void;
    proceso: ProcesoFalso;
  }[] = [];
  const run: RunCommand = (file, args, done) => {
    const proceso: ProcesoFalso = { pid: 4000 + llamadas.length, exitCode: null, signalCode: null };
    llamadas.push({ file, args, done, proceso });
    return proceso;
  };
  return { run, llamadas };
}

/** Matador de árboles falso: guarda cada intento para resolverlo cuando el test quiera. */
function killerFalso() {
  const kills: { pid: number; done: (err: Error | null) => void }[] = [];
  const killTree: KillTree = (pid, done) => {
    kills.push({ pid, done });
  };
  return { killTree, kills };
}

describe('createTasklistLister (timeout sin dejar tasklist huérfanos)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lanza el comando de tasklistCommand y parsea su salida', async () => {
    const { run, llamadas } = runnerFalso();
    const listar = createTasklistLister({ run, timeoutMs: 10000 });
    const p = listar();
    expect(llamadas).toHaveLength(1);
    expect({ file: llamadas[0].file, args: llamadas[0].args }).toEqual(tasklistCommand());
    llamadas[0].done(null, '"System","4"\r\n"cs2.exe","99"\r\n');
    await expect(p).resolves.toEqual(['System', 'cs2.exe']);
  });

  it('un error del comando rechaza y el siguiente sondeo vuelve a lanzarlo', async () => {
    const { run, llamadas } = runnerFalso();
    const listar = createTasklistLister({ run, timeoutMs: 10000 });
    const p = listar();
    llamadas[0].done(new Error('exit 1'), '');
    await expect(p).rejects.toThrow('exit 1');
    void listar().catch(() => {});
    expect(llamadas).toHaveLength(2);
  });

  it('a los timeoutMs rechaza, y no lanza otro mientras el anterior siga vivo (regresión: huérfanos)', async () => {
    // Matar el cmd al vencer el timeout dejaba a tasklist (su hijo) vivo; con WMI colgado, cada sondeo
    // sumaba uno. Ahora el sondeo falla igual a los 10 s, pero el siguiente no lanza otro proceso.
    const { run, llamadas } = runnerFalso();
    const listar = createTasklistLister({ run, timeoutMs: 10000 });
    const p1 = listar();
    const r1 = expect(p1).rejects.toThrow('sin respuesta en 10000 ms');
    await vi.advanceTimersByTimeAsync(10000);
    await r1;

    const p2 = listar();
    expect(llamadas).toHaveLength(1); // no se lanzó un segundo cmd/tasklist
    await expect(p2).rejects.toThrow('sigue en curso');

    // El colgado termina por fin (su resultado se descarta): el siguiente sondeo ya lanza uno nuevo.
    llamadas[0].done(null, '"tarde.exe","1"\r\n');
    const p3 = listar();
    expect(llamadas).toHaveLength(2);
    llamadas[1].done(null, '"cs2.exe","1"\r\n');
    await expect(p3).resolves.toEqual(['cs2.exe']);
  });

  it('una respuesta a tiempo cancela el timeout (sin rechazo tardío)', async () => {
    const { run, llamadas } = runnerFalso();
    const listar = createTasklistLister({ run, timeoutMs: 10000 });
    const p = listar();
    llamadas[0].done(null, '"a.exe","1"\r\n');
    await expect(p).resolves.toEqual(['a.exe']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('si lanzar el comando falla en síncrono, rechaza y no se queda «en curso» para siempre', async () => {
    let intentos = 0;
    const { killTree, kills } = killerFalso();
    const listar = createTasklistLister({
      run: () => {
        intentos++;
        throw new Error('spawn EINVAL');
      },
      killTree,
      timeoutMs: 10000,
    });
    await expect(listar()).rejects.toThrow('spawn EINVAL');
    await expect(listar()).rejects.toThrow('spawn EINVAL');
    expect(intentos).toBe(2);
    expect(vi.getTimerCount()).toBe(0); // ni timeout ni válvula colgando
    expect(kills).toHaveLength(0);
  });
});

describe('createTasklistLister — válvula de seguridad (regresión B3-2: tasklist colgado para siempre)', () => {
  // Sin válvula, un tasklist que no vuelve nunca congelaba la detección hasta reiniciar: con un juego en
  // marcha `running` no se vaciaba y la grabación de sesión automática seguía llenando el disco.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function montar() {
    const { run, llamadas } = runnerFalso();
    const { killTree, kills } = killerFalso();
    const listar = createTasklistLister({ run, killTree, timeoutMs: 10000, valveMs: 60000 });
    return { listar, llamadas, kills };
  }

  it('a los 60 s con el sondeo vivo mata el árbol del cmd por su pid (un aviso por intento)', async () => {
    const { listar, llamadas, kills } = montar();
    void listar().catch(() => {});
    await vi.advanceTimersByTimeAsync(59999);
    expect(kills).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(kills.map((k) => k.pid)).toEqual([llamadas[0].proceso.pid]);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('mientras el árbol no muera no hay segundo sondeo; cuando el cmd vuelve, se sondea de nuevo', async () => {
    const { listar, llamadas, kills } = montar();
    void listar().catch(() => {});
    await vi.advanceTimersByTimeAsync(60000);
    expect(kills).toHaveLength(1);

    const enMedio = listar();
    expect(llamadas).toHaveLength(1);
    await expect(enMedio).rejects.toThrow('sigue en curso');

    // taskkill mata el árbol: responde taskkill y el cmd sale con error.
    kills[0].done(null);
    llamadas[0].done(new Error('cmd terminado por taskkill'), '');
    const p = listar();
    expect(llamadas).toHaveLength(2);
    llamadas[1].done(null, '"cs2.exe","1"\r\n');
    await expect(p).resolves.toEqual(['cs2.exe']);

    await vi.advanceTimersByTimeAsync(180000);
    expect(kills).toHaveLength(1); // ni el sondeo terminado ni el nuevo vuelven a disparar la válvula
    expect(vi.getTimerCount()).toBe(0);
  });

  it('si taskkill falla (WMI colgado), reintenta 60 s después sin lanzar nada más entretanto', async () => {
    const { listar, llamadas, kills } = montar();
    void listar().catch(() => {});
    await vi.advanceTimersByTimeAsync(60000);
    kills[0].done(new Error('taskkill: sin respuesta'));

    await vi.advanceTimersByTimeAsync(59999);
    expect(kills).toHaveLength(1);
    const enMedio = listar();
    expect(llamadas).toHaveLength(1);
    await expect(enMedio).rejects.toThrow('sigue en curso');

    await vi.advanceTimersByTimeAsync(1);
    expect(kills.map((k) => k.pid)).toEqual([llamadas[0].proceso.pid, llamadas[0].proceso.pid]);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it('nunca hay dos taskkill a la vez: el reintento cuenta desde que responde el anterior', async () => {
    const { listar, kills } = montar();
    void listar().catch(() => {});
    await vi.advanceTimersByTimeAsync(60000);
    await vi.advanceTimersByTimeAsync(300000); // el primer taskkill no ha respondido
    expect(kills).toHaveLength(1);
    kills[0].done(new Error('taskkill: sin respuesta'));
    await vi.advanceTimersByTimeAsync(60000);
    expect(kills).toHaveLength(2);
  });

  it('un sondeo que responde antes de los 60 s no arma nada', async () => {
    const { listar, llamadas, kills } = montar();
    const p = listar();
    await vi.advanceTimersByTimeAsync(5000);
    llamadas[0].done(null, '"a.exe","1"\r\n');
    await expect(p).resolves.toEqual(['a.exe']);
    await vi.advanceTimersByTimeAsync(180000);
    expect(kills).toHaveLength(0);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('si lanzar taskkill lanza en síncrono (p. ej. ENOMEM), no escapa del temporizador y la válvula se rearma (regresión 2.1)', async () => {
    // spawn/execFile lanzan en síncrono para errores que no son EACCES/EAGAIN/EMFILE/ENFILE/ENOENT: sin
    // try/catch sería una excepción no capturada en un temporizador del main y la válvula no volvería
    // a armarse (detección congelada otra vez).
    const { run, llamadas } = runnerFalso();
    const pids: number[] = [];
    const listar = createTasklistLister({
      run,
      killTree: (pid) => {
        pids.push(pid);
        throw new Error('spawn ENOMEM');
      },
      timeoutMs: 10000,
      valveMs: 60000,
    });
    void listar().catch(() => {});
    await vi.advanceTimersByTimeAsync(60000); // con la excepción escapando, esto rechaza
    expect(pids).toEqual([llamadas[0].proceso.pid]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('spawn ENOMEM'));

    await vi.advanceTimersByTimeAsync(59999);
    expect(pids).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(pids).toEqual([llamadas[0].proceso.pid, llamadas[0].proceso.pid]);
    expect(llamadas).toHaveLength(1); // ningún segundo sondeo mientras tanto

    // Cuando el cmd vuelve, se sondea de nuevo y no queda ninguna válvula armada.
    llamadas[0].done(new Error('cmd terminado'), '');
    const p = listar();
    expect(llamadas).toHaveLength(2);
    llamadas[1].done(null, '"cs2.exe","1"\r\n');
    await expect(p).resolves.toEqual(['cs2.exe']);
    await vi.advanceTimersByTimeAsync(180000);
    expect(pids).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('si el cmd ya salió pero su salida sigue abierta, no mata por pid (podría estar reusado) y libera', async () => {
    const { listar, llamadas, kills } = montar();
    void listar().catch(() => {});
    llamadas[0].proceso.exitCode = 1; // p. ej. lo cerró otro proceso; algo retiene la tubería
    await vi.advanceTimersByTimeAsync(60000);
    expect(kills).toHaveLength(0);
    expect(console.warn).toHaveBeenCalledTimes(1);

    const p2 = listar();
    expect(llamadas).toHaveLength(2);
    // El callback tardío del primero no puede liberar al segundo, que sigue vivo.
    llamadas[0].done(null, '"tarde.exe","1"\r\n');
    const p3 = listar();
    expect(llamadas).toHaveLength(2);
    await expect(p3).rejects.toThrow('sigue en curso');
    llamadas[1].done(null, '"cs2.exe","1"\r\n');
    await expect(p2).resolves.toEqual(['cs2.exe']);
  });
});
