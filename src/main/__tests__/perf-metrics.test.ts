import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PERF_OVERLAY, type PerfSnapshot } from '@shared/perf';
import { cpuTimesFrom, cpuUsageBetween, ramMb } from '../perf-metrics/cpu';
import {
  EMPTY_SENSOR_READING,
  SensorsReader,
  parseSensorsLine,
  type LineProcess,
} from '../perf-metrics/sensors';
import {
  FpsTracker,
  PresentMonReader,
  parseCsvHeader,
  presentMonArgs,
} from '../perf-metrics/presentmon';
import { PerfSampler } from '../perf-metrics/sampler';

// ---------------------------------------------------------------------------------------- CPU/RAM

function cpusFalsos(idle: number, user: number) {
  return [{ times: { user, nice: 0, sys: 0, idle, irq: 0 } }];
}

describe('cpu', () => {
  it('la primera muestra no tiene delta → null', () => {
    expect(cpuUsageBetween(null, cpuTimesFrom(cpusFalsos(100, 100)))).toBeNull();
  });

  it('calcula el uso con el delta entre muestras', () => {
    const prev = cpuTimesFrom(cpusFalsos(1000, 1000));
    const next = cpuTimesFrom(cpusFalsos(1300, 1700)); // +300 idle, +700 user
    expect(cpuUsageBetween(prev, next)).toBe(70);
  });

  it('contadores congelados → null (no un NaN)', () => {
    const t = cpuTimesFrom(cpusFalsos(500, 500));
    expect(cpuUsageBetween(t, t)).toBeNull();
  });

  it('ramMb convierte bytes a MB usada/total', () => {
    const gb = 1024 * 1024 * 1024;
    const ram = ramMb(16 * gb, 6 * gb);
    expect(ram.totalMb).toBe(16 * 1024);
    expect(ram.usedMb).toBe(10 * 1024);
  });
});

// ---------------------------------------------------------------------------------------- Sensores

describe('parseSensorsLine', () => {
  it('parsea una línea del helper con nulls donde falta el sensor', () => {
    const line =
      '{"gpuUsage":31,"gpuTemp":42,"gpuFan":1201,"gpuVoltage":null,"vramUsedMb":4717,"vramTotalMb":12282,"cpuTemp":null}';
    expect(parseSensorsLine(line)).toEqual({
      gpuUsage: 31,
      gpuTemp: 42,
      gpuFan: 1201,
      gpuVoltage: null,
      vramUsedMb: 4717,
      vramTotalMb: 12282,
      cpuTemp: null,
    });
  });

  it('línea corrupta o no-objeto → null', () => {
    expect(parseSensorsLine('no es json')).toBeNull();
    expect(parseSensorsLine('42')).toBeNull();
  });

  it('campos con tipos raros caen a null', () => {
    expect(parseSensorsLine('{"gpuUsage":"31"}')!.gpuUsage).toBeNull();
  });
});

/** Proceso falso controlable desde el test. */
function procesoFalso() {
  let lineListener: ((line: string) => void) | null = null;
  let exitListener: (() => void) | null = null;
  const proc: LineProcess = {
    kill: vi.fn(),
    onLine: (l) => (lineListener = l),
    onExit: (l) => (exitListener = l),
  };
  return {
    proc,
    emitLine: (line: string) => lineListener?.(line),
    emitExit: () => exitListener?.(),
  };
}

describe('SensorsReader', () => {
  it('recuerda la última lectura y la limpia si el proceso muere', () => {
    const fake = procesoFalso();
    const reader = new SensorsReader({ helperPath: () => 'C:\\fake.exe', spawn: () => fake.proc });
    reader.start();
    fake.emitLine('{"gpuUsage":50}');
    expect(reader.latest().gpuUsage).toBe(50);

    fake.emitExit();
    expect(reader.latest()).toEqual(EMPTY_SENSOR_READING);
  });

  it('sin binario es un no-op que no insiste', () => {
    const helperPath = vi.fn().mockReturnValue(null);
    const reader = new SensorsReader({ helperPath, spawn: () => procesoFalso().proc });
    reader.start();
    reader.start();
    expect(helperPath).toHaveBeenCalledTimes(1);
    expect(reader.latest()).toEqual(EMPTY_SENSOR_READING);
  });

  it('tras morir, start() no lo relanza en caliente; stop() + start() sí fuerza', () => {
    // El relanzado automático existe pero es ESPACIADO (ver los tests de recuperación de más abajo):
    // un `start()` inmediato —p. ej. al guardar otro ajuste cualquiera— no debe saltárselo. `stop()`
    // sí borra el estado, así que es la vía explícita para forzar un intento ya.
    const fake = procesoFalso();
    const spawn = vi.fn().mockReturnValue(fake.proc);
    const reader = new SensorsReader({ helperPath: () => 'C:\\fake.exe', spawn });
    reader.start();
    fake.emitExit();
    reader.start();
    expect(spawn).toHaveBeenCalledTimes(1);
    reader.stop();
    reader.start();
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  // --- Modo del helper: abrir el grupo de CPU solo si se pidió Temp CPU ---------------------------
  //
  // Sin `--cpu`, el helper no abre el grupo de CPU y no toca los MSR — que es lo que engancha PawnIO.
  // Quien solo quiere FPS y uso de GPU no debe provocar la carga de un driver de anillo 0.

  it('sin modo CPU lanza el helper sin --cpu', () => {
    const spawn = vi.fn().mockReturnValue(procesoFalso().proc);
    const reader = new SensorsReader({ helperPath: () => 'C:\\fake.exe', spawn });

    reader.start({ cpu: false });

    expect(spawn).toHaveBeenCalledWith('C:\\fake.exe', []);
  });

  it('con modo CPU lanza el helper con --cpu', () => {
    const spawn = vi.fn().mockReturnValue(procesoFalso().proc);
    const reader = new SensorsReader({ helperPath: () => 'C:\\fake.exe', spawn });

    reader.start({ cpu: true });

    expect(spawn).toHaveBeenCalledWith('C:\\fake.exe', ['--cpu']);
  });

  it('pedir el mismo modo dos veces no relanza', () => {
    const spawn = vi.fn().mockReturnValue(procesoFalso().proc);
    const reader = new SensorsReader({ helperPath: () => 'C:\\fake.exe', spawn });

    reader.start({ cpu: true });
    reader.start({ cpu: true });

    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('cambiar de modo mata el helper anterior y lo relanza con los argumentos nuevos', () => {
    const primero = procesoFalso();
    const segundo = procesoFalso();
    const spawn = vi.fn().mockReturnValueOnce(primero.proc).mockReturnValueOnce(segundo.proc);
    const reader = new SensorsReader({ helperPath: () => 'C:\\fake.exe', spawn });

    reader.start({ cpu: false });
    reader.start({ cpu: true });

    expect(primero.proc.kill).toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn).toHaveBeenLastCalledWith('C:\\fake.exe', ['--cpu']);
  });

  it('al cambiar de modo conserva la última lectura (las métricas de GPU no parpadean)', () => {
    // Relanzar tarda ~1 s en dar la primera muestra. Limpiar la lectura pintaría «—» en las métricas
    // de GPU por tocar un checkbox que no les incumbe; un valor de hace un segundo informa mejor.
    const primero = procesoFalso();
    const segundo = procesoFalso();
    const spawn = vi.fn().mockReturnValueOnce(primero.proc).mockReturnValueOnce(segundo.proc);
    const reader = new SensorsReader({ helperPath: () => 'C:\\fake.exe', spawn });

    reader.start({ cpu: false });
    primero.emitLine('{"gpuUsage":50,"gpuTemp":60}');
    reader.start({ cpu: true });

    expect(reader.latest().gpuUsage).toBe(50);
    expect(reader.latest().gpuTemp).toBe(60);
  });

  it('stop() sí limpia la lectura', () => {
    const fake = procesoFalso();
    const reader = new SensorsReader({ helperPath: () => 'C:\\fake.exe', spawn: () => fake.proc });

    reader.start({ cpu: true });
    fake.emitLine('{"gpuUsage":50}');
    reader.stop();

    expect(reader.latest()).toEqual(EMPTY_SENSOR_READING);
  });

  // --- Recuperación tras una muerte inesperada ---------------------------------------------------
  //
  // Antes, morir una vez dejaba las SIETE métricas de hardware en «—» el resto de la sesión, sin
  // aviso: `failed` no se levantaba nunca. Ahora se relanza solo, espaciado.

  it('si el helper muere, vuelve solo pasado el tiempo de reintento', () => {
    let t = 0;
    const primero = procesoFalso();
    const segundo = procesoFalso();
    const spawn = vi.fn().mockReturnValueOnce(primero.proc).mockReturnValueOnce(segundo.proc);
    const reader = new SensorsReader({ helperPath: () => 'C:\\fake.exe', spawn, now: () => t });

    reader.start({ cpu: false });
    primero.emitExit();

    // Enseguida no: relanzar en caliente encadenaría arranques fallidos.
    reader.latest();
    expect(spawn).toHaveBeenCalledTimes(1);

    t += 10_000;
    reader.latest();
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it('al relanzarse tras morir conserva el modo que tenía', () => {
    let t = 0;
    const primero = procesoFalso();
    const segundo = procesoFalso();
    const spawn = vi.fn().mockReturnValueOnce(primero.proc).mockReturnValueOnce(segundo.proc);
    const reader = new SensorsReader({ helperPath: () => 'C:\\fake.exe', spawn, now: () => t });

    reader.start({ cpu: true });
    primero.emitExit();
    t += 10_000;
    reader.latest();

    // Si volviera sin `--cpu`, la temperatura no regresaría nunca aunque el helper sí.
    expect(spawn).toHaveBeenLastCalledWith('C:\\fake.exe', ['--cpu']);
  });

  it('mientras está muerto no enseña cifras viejas', () => {
    const fake = procesoFalso();
    const reader = new SensorsReader({
      helperPath: () => 'C:\\fake.exe',
      spawn: () => fake.proc,
      now: () => 0, // el reloj no avanza: aquí solo interesa el instante de la muerte
    });

    reader.start({ cpu: false });
    fake.emitLine('{"gpuUsage":50}');
    fake.emitExit();

    // Un valor de hace un minuto presentado como actual es peor que un guion: el usuario no puede
    // distinguirlo. (Distinto del relanzado por cambio de modo, donde el hueco es de ~1 s.)
    expect(reader.latest()).toEqual(EMPTY_SENSOR_READING);
  });

  it('dos ticks seguidos no lo relanzan dos veces', () => {
    let t = 0;
    const primero = procesoFalso();
    const spawn = vi.fn().mockReturnValue(primero.proc);
    const reader = new SensorsReader({ helperPath: () => 'C:\\fake.exe', spawn, now: () => t });

    reader.start({ cpu: false });
    primero.emitExit();
    t += 10_000;
    reader.latest();
    reader.latest();
    reader.latest();

    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it('sin binario sigue sin reintentar (eso no se arregla esperando)', () => {
    let t = 0;
    const helperPath = vi.fn().mockReturnValue(null);
    const reader = new SensorsReader({
      helperPath,
      spawn: () => procesoFalso().proc,
      now: () => t,
    });

    reader.start({ cpu: false });
    t += 120_000;
    reader.latest();
    reader.latest();

    expect(helperPath).toHaveBeenCalledTimes(1);
  });
});

// -------------------------------------------------------------------------------------- PresentMon

// Cabecera real de PresentMon 2.5.1 (recortada): las columnas que leemos van en 0 y 11.
const CABECERA =
  'Application,ProcessID,SwapChainAddress,PresentRuntime,SyncInterval,PresentFlags,AllowsTearing,PresentMode,FrameType,TimeInMs,MsBetweenSimulationStart,MsBetweenPresents,MsBetweenDisplayChange';

// Modos de presentación reales de PresentMon (columna 7). Los `Hardware…` son los de pantalla
// completa y ventana sin bordes: solo esos califican a un proceso para el contador de FPS.
/** Pantalla completa / sin bordes con flip directo: el caso normal de un juego. */
const MODO_JUEGO = 'Hardware: Independent Flip';
/** Sin bordes con MPO. Empieza por «Hardware» aunque contenga «Composed»: también califica. */
const MODO_JUEGO_MPO = 'Hardware Composed: Independent Flip';
/** Por el compositor de Windows: Discord, navegadores, editores. Nunca califica. */
const MODO_ESCRITORIO = 'Composed: Flip';

/**
 * Fila CSV con el layout de PresentMon 2.x (PresentMode en la 7, MsBetweenPresents en la 11). El
 * modo por defecto es el de escritorio: así un test que quiera FPS tiene que pedir el modo de juego
 * explícitamente, y no se cuela una calificación por descuido.
 */
function fila(exe: string, ms: number, modo: string = MODO_ESCRITORIO): string {
  return [exe, '123', '0x0', 'DXGI', '0', '0', '0', modo, 'Application', '0', '0', String(ms), String(ms)].join(',');
}

/** Reader con un proceso falso y reloj controlado. */
function readerFalso() {
  const fake = procesoFalso();
  let t = 0;
  const spawn = vi.fn().mockReturnValue(fake.proc);
  const reader = new PresentMonReader({
    helperPath: () => 'C:\\pm.exe',
    spawn,
    selfExe: () => 'GameClip.exe',
    now: () => t,
  });
  return {
    reader,
    fake,
    spawn,
    avanzar: (ms: number) => (t += ms),
    ahora: () => t,
    /** Emite `n` presents del proceso, uno cada `ms`, avanzando el reloj. */
    presentar: (exe: string, ms: number, n: number, modo: string = MODO_ESCRITORIO) => {
      for (let i = 0; i < n; i++) {
        t += ms;
        fake.emitLine(fila(exe, ms, modo));
      }
    },
  };
}

describe('presentmon — recuperación tras morir', () => {
  /** Como `readerFalso`, pero cada spawn devuelve un proceso nuevo (hace falta para relanzados). */
  function readerConRelanzado() {
    let t = 0;
    const procesos: ReturnType<typeof procesoFalso>[] = [];
    const spawn = vi.fn().mockImplementation(() => {
      const p = procesoFalso();
      procesos.push(p);
      return p.proc;
    });
    const reader = new PresentMonReader({
      helperPath: () => 'C:\\pm.exe',
      spawn,
      selfExe: () => 'GameClip.exe',
      now: () => t,
    });
    return { reader, spawn, procesos, avanzar: (ms: number) => (t += ms) };
  }

  it('si PresentMon muere, vuelve solo pasado el tiempo de reintento', () => {
    // Antes esto dejaba los FPS en «—» el resto de la sesión, en silencio.
    const { reader, spawn, procesos, avanzar } = readerConRelanzado();
    reader.start();
    procesos[0].emitExit();

    reader.fps();
    expect(spawn).toHaveBeenCalledTimes(1); // en caliente no

    avanzar(10_000);
    reader.fps();
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it('los reintentos por muerte se espacian en vez de encadenarse', () => {
    const { reader, spawn, procesos, avanzar } = readerConRelanzado();
    reader.start();

    // Muere una y otra vez nada más arrancar: el peor caso para un bucle de arranques.
    for (let i = 0; i < 6; i++) {
      procesos[procesos.length - 1].emitExit();
      avanzar(10_000);
      reader.fps();
    }

    // Con cadencia lenta (60 s) los últimos intentos ya no caben en ventanas de 10 s: se frena solo.
    expect(spawn.mock.calls.length).toBeLessThan(7);
    expect(spawn.mock.calls.length).toBeGreaterThan(1);
  });

  it('sin binario no reintenta', () => {
    let t = 0;
    const helperPath = vi.fn().mockReturnValue(null);
    const reader = new PresentMonReader({
      helperPath,
      spawn: vi.fn(),
      selfExe: () => 'GameClip.exe',
      now: () => t,
    });

    reader.start();
    t += 120_000;
    reader.fps();
    reader.fps();

    expect(helperPath).toHaveBeenCalledTimes(1);
  });
});

describe('presentmon', () => {
  it('captura todos los procesos y excluye compositor y la propia app', () => {
    const args = presentMonArgs(['dwm.exe', 'gameclip.exe']);
    expect(args).toContain('--output_stdout');
    // La vista de swap chains iría por la misma salida y rompería el parseo del CSV.
    expect(args).toContain('--no_console_stats');
    // Sin --process_name captura todo: los FPS no dependen del juego detectado.
    expect(args).not.toContain('--process_name');
    expect(args.join(' ')).toContain('--exclude dwm.exe');
    expect(args.join(' ')).toContain('--exclude gameclip.exe');
    // Flags de PresentMon 2.x: doble guion (los de la 1.x eran de guion simple).
    expect(args.every((a) => !a.startsWith('-') || a.startsWith('--'))).toBe(true);
  });

  it('lee las columnas Application y MsBetweenPresents de la cabecera de PresentMon 2.x', () => {
    expect(parseCsvHeader(CABECERA)).toEqual({
      application: 0,
      msBetweenPresents: 11,
      presentMode: 7,
    });
    expect(parseCsvHeader('a,b,c')).toBeNull();
  });

  it('FpsTracker: media de la ventana y null cuando los datos envejecen', () => {
    const tracker = new FpsTracker();
    for (let i = 0; i < 10; i++) tracker.push(16.666, 1000 + i * 17);
    expect(Math.round(tracker.fps(1200)!)).toBe(60);
    // Sin presents nuevos → null (no se muestran "60 fps" viejos).
    expect(tracker.fps(6000)).toBeNull();
  });

  it('regresión: una ráfaga que vacía la ventana no parpadea a «—»', () => {
    // PresentMon escribe por bloques cuando su salida es una tubería, así que las muestras llegan
    // apelotonadas. Con la ventana (1 s) igual al periodo de muestreo, un bloque que tardaba un pelo
    // de más dejaba la ventana vacía y el overlay caía a «—» para recuperarse al bloque siguiente.
    const tracker = new FpsTracker();
    for (let i = 0; i < 10; i++) tracker.push(16.666, 1000);
    expect(Math.round(tracker.fps(1100)!)).toBe(60);

    // Ventana vacía pero dentro del margen de gracia: se sostiene la última lectura.
    expect(Math.round(tracker.fps(2050)!)).toBe(60);

    // Pasado el margen sí se admite que no hay nada presentando.
    expect(tracker.fps(3200)).toBeNull();
  });

  it('mide los FPS de una app aunque no sea un juego detectado', () => {
    const { reader, fake, presentar } = readerFalso();
    reader.start();
    fake.emitLine(CABECERA);
    // Un emulador cualquiera: nadie le dijo al reader qué proceso mirar.
    presentar('eden.exe', 10, 60, MODO_JUEGO);
    expect(Math.round(reader.fps()!)).toBe(100);
  });

  it('mantiene el juego enganchado frente a otro algo más rápido (sin saltos)', () => {
    const { reader, fake, presentar } = readerFalso();
    reader.start();
    fake.emitLine(CABECERA);
    // El juego se engancha a 33 ms (~30 fps), como un emulador capado.
    presentar('eden.exe', 33, 40, MODO_JUEGO);
    expect(Math.round(reader.fps()!)).toBe(30);

    // Otro proceso TAMBIÉN calificado a ~35 fps: supera al enganchado pero no el margen → no roba
    // la lectura. (Antes este caso usaba chrome.exe; ahora una app de escritorio ni siquiera entra
    // al enganche, así que el margen se prueba entre dos calificados, que es donde sigue vivo.)
    for (let i = 0; i < 40; i++) {
      presentar('eden.exe', 33, 1, MODO_JUEGO);
      fake.emitLine(fila('otrojuego.exe', 28.5, MODO_JUEGO));
    }
    expect(Math.round(reader.fps()!)).toBe(30);
  });

  it('regresión: no se queda pegado a una app de escritorio con el juego mucho más rápido', () => {
    // Caso real medido: el overlay marcaba 52 fps (Discord) con el juego a 129, porque el enganche
    // era permanente y al arrancar antes que el juego se pegó a Discord para siempre.
    // Con la calificación por modo de presentación el caso se ataja antes: Discord NUNCA entra al
    // enganche, así que no hay nada que robarle.
    const { reader, fake, presentar, avanzar } = readerFalso();
    reader.start();
    fake.emitLine(CABECERA);

    // Solo Discord presenta al principio (el juego aún no arrancó): presenta por el compositor, así
    // que no califica y el overlay pinta «—» en vez de los FPS de Discord.
    presentar('discord.exe', 18.2, 60);
    expect(reader.fps()).toBeNull();

    // Arranca el juego a ~130 fps mientras Discord sigue a sus ~55: se lleva el contador entero.
    for (let i = 0; i < 130; i++) {
      avanzar(7.7);
      fake.emitLine(fila('re9demo.exe', 7.7, MODO_JUEGO));
      if (i % 2 === 0) fake.emitLine(fila('discord.exe', 18.2));
    }
    expect(Math.round(reader.fps()!)).toBe(130);
  });

  it('re-engancha al de mayor tasa cuando el enganchado deja de presentar', () => {
    const { reader, fake, presentar, avanzar } = readerFalso();
    reader.start();
    fake.emitLine(CABECERA);
    presentar('eden.exe', 33, 40, MODO_JUEGO);
    expect(Math.round(reader.fps()!)).toBe(30);

    // El emulador se cierra; sigue habiendo otro juego presentando.
    avanzar(6000);
    presentar('otrojuego.exe', 10, 60, MODO_JUEGO);
    expect(Math.round(reader.fps()!)).toBe(100);
  });

  it('sin nada presentando devuelve null (el overlay pinta «—»)', () => {
    const { reader, fake, presentar, avanzar } = readerFalso();
    reader.start();
    fake.emitLine(CABECERA);
    presentar('eden.exe', 16, 40, MODO_JUEGO);
    expect(reader.fps()).not.toBeNull();
    avanzar(10_000);
    expect(reader.fps()).toBeNull();
  });

  it('ignora los procesos de la denylist aunque presenten', () => {
    const { reader, fake } = readerFalso();
    reader.start();
    fake.emitLine(CABECERA);
    for (let i = 0; i < 40; i++) {
      fake.emitLine(fila('dwm.exe', 16.6));
      fake.emitLine(fila('GameClip.exe', 16.6));
    }
    expect(reader.fps()).toBeNull();
  });

  it('reinicia PresentMon si arranca vivo pero mudo (sesión ETW sin eventos)', () => {
    // Caso real: con los cupos del proveedor ETW agotados por sesiones huérfanas, PresentMon
    // arranca sin error pero no entrega una sola línea, y los FPS quedaban en «—» en silencio.
    const fake = procesoFalso();
    let t = 0;
    const spawn = vi.fn().mockReturnValue(fake.proc);
    const reader = new PresentMonReader({
      helperPath: () => 'C:\\pm.exe',
      spawn,
      selfExe: () => 'GameClip.exe',
      now: () => t,
    });
    reader.start();
    expect(spawn).toHaveBeenCalledTimes(1);

    // Aún dentro del margen: no se toca.
    t = 5000;
    expect(reader.fps()).toBeNull();
    expect(spawn).toHaveBeenCalledTimes(1);

    // Pasado el margen sin una sola línea: se reinicia el proceso.
    t = 13_000;
    expect(reader.fps()).toBeNull();
    expect(spawn).toHaveBeenCalledTimes(2);
    // Y el reinicio propio NO debe marcarlo como fallido para siempre.
    t = 26_000;
    reader.fps();
    expect(spawn).toHaveBeenCalledTimes(3);
  });

  it('el watchdog espacia los reintentos en vez de rendirse del todo', () => {
    const fake = procesoFalso();
    let t = 0;
    const spawn = vi.fn().mockReturnValue(fake.proc);
    const reader = new PresentMonReader({
      helperPath: () => 'C:\\pm.exe',
      spawn,
      selfExe: () => 'GameClip.exe',
      now: () => t,
    });
    reader.start();
    // Tres reintentos rápidos (cada 12 s).
    for (let i = 1; i <= 3; i++) {
      t += 13_000;
      reader.fps();
    }
    expect(spawn).toHaveBeenCalledTimes(4);

    // A partir de ahí la cadencia es lenta: 13 s ya no bastan...
    t += 13_000;
    reader.fps();
    expect(spawn).toHaveBeenCalledTimes(4);

    // ...pero al pasar el minuto vuelve a intentarlo (los FPS no quedan muertos para siempre).
    t += 61_000;
    reader.fps();
    expect(spawn).toHaveBeenCalledTimes(5);
  });

  it('si llegan líneas, el watchdog no reinicia nada', () => {
    const fake = procesoFalso();
    let t = 0;
    const spawn = vi.fn().mockReturnValue(fake.proc);
    const reader = new PresentMonReader({
      helperPath: () => 'C:\\pm.exe',
      spawn,
      selfExe: () => 'GameClip.exe',
      now: () => t,
    });
    reader.start();
    fake.emitLine(CABECERA);
    t = 30_000;
    reader.fps();
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  // ------------------------------------------------- Calificación: FPS solo cuando hay un juego

  it('solo apps de escritorio presentando → «—» (no se inventa una cifra)', () => {
    const { reader, fake, presentar } = readerFalso();
    reader.start();
    fake.emitLine(CABECERA);
    presentar('discord.exe', 18.2, 60);
    presentar('chrome.exe', 16.6, 60);
    presentar('code.exe', 33, 30);
    expect(reader.fps()).toBeNull();
  });

  it('las demás métricas no dependen de esto: solo los FPS caen a null', () => {
    // El contrato de la feature es que apagar los FPS NO apaga el overlay. El reader solo produce
    // FPS, así que aquí se comprueba lo que le toca: devuelve null sin morir ni marcarse fallido.
    const { reader, fake, presentar, spawn } = readerFalso();
    reader.start();
    fake.emitLine(CABECERA);
    presentar('discord.exe', 16.6, 60);
    expect(reader.fps()).toBeNull();
    // Sigue vivo y escuchando: en cuanto aparezca un juego habrá FPS, sin reiniciar nada.
    expect(spawn).toHaveBeenCalledTimes(1);
    presentar('re9demo.exe', 8, 60, MODO_JUEGO);
    expect(Math.round(reader.fps()!)).toBe(125);
  });

  it('un juego sin bordes con MPO también califica (el modo lleva «Composed» en el nombre)', () => {
    // `Hardware Composed: Independent Flip` contiene «Composed» pero es hardware: si se comparara
    // por subcadena en vez de por prefijo, este juego quedaría en «—».
    const { reader, fake, presentar } = readerFalso();
    reader.start();
    fake.emitLine(CABECERA);
    presentar('eden.exe', 10, 60, MODO_JUEGO_MPO);
    expect(Math.round(reader.fps()!)).toBe(100);
  });

  it('calificar es puerta de entrada, no filtro: si DWM degrada el modo conserva el contador', () => {
    const { reader, fake, presentar } = readerFalso();
    reader.start();
    fake.emitLine(CABECERA);
    presentar('eden.exe', 10, 60, MODO_JUEGO);
    expect(Math.round(reader.fps()!)).toBe(100);

    // El juego pasa a presentar compuesto (se abrió un menú, un overlay de terceros se superpuso).
    // No debe caer a «—»: ya está calificado y la calificación no se apaga.
    presentar('eden.exe', 10, 60, MODO_ESCRITORIO);
    expect(Math.round(reader.fps()!)).toBe(100);
  });

  it('un proceso no calificado no roba el enganche por rápido que vaya', () => {
    const { reader, fake, presentar, avanzar } = readerFalso();
    reader.start();
    fake.emitLine(CABECERA);
    presentar('eden.exe', 33, 40, MODO_JUEGO);
    expect(Math.round(reader.fps()!)).toBe(30);

    // Un navegador a ~125 fps supera de sobra el MARGEN_CAMBIO, pero no califica: ni lo toca.
    for (let i = 0; i < 120; i++) {
      avanzar(8);
      fake.emitLine(fila('chrome.exe', 8));
      if (i % 4 === 0) fake.emitLine(fila('eden.exe', 33, MODO_JUEGO));
    }
    expect(Math.round(reader.fps()!)).toBe(30);
  });

  it('setDetectedGame califica a un emulador en ventana (segunda vía)', () => {
    const { reader, fake, presentar } = readerFalso();
    reader.start();
    fake.emitLine(CABECERA);
    // Emulador en ventana normal: presenta compuesto, así que por modo no califica.
    presentar('emu.exe', 10, 60);
    expect(reader.fps()).toBeNull();

    // La app lo tiene detectado (lista curada o alta manual): eso lo califica.
    reader.setDetectedGame('emu.exe');
    expect(Math.round(reader.fps()!)).toBe(100);
  });

  it('setDetectedGame(null) no apaga al ya calificado, pero deja de calificar a los nuevos', () => {
    const { reader, fake, presentar, avanzar } = readerFalso();
    reader.start();
    fake.emitLine(CABECERA);
    reader.setDetectedGame('emu.exe');
    presentar('emu.exe', 10, 60);
    expect(Math.round(reader.fps()!)).toBe(100);

    // Se cierra el juego. El tracker ya calificado conserva su marca (es pegajosa)...
    reader.setDetectedGame(null);
    presentar('emu.exe', 10, 60);
    expect(Math.round(reader.fps()!)).toBe(100);

    // ...pero cuando se poda por inactividad, el tracker nuevo ya no hereda nada.
    avanzar(10_000);
    expect(reader.fps()).toBeNull();
    presentar('emu.exe', 10, 60);
    expect(reader.fps()).toBeNull();
  });

  it('el juego detectado se compara sin distinguir mayúsculas', () => {
    const { reader, fake, presentar } = readerFalso();
    reader.start();
    fake.emitLine(CABECERA);
    // El detector reporta el ejecutable como lo ve Windows; PresentMon lo escribe a su manera.
    reader.setDetectedGame('Emu.exe');
    presentar('emu.exe', 10, 60);
    expect(Math.round(reader.fps()!)).toBe(100);
  });

  it('cabecera sin PresentMode: se degrada a «todo califica» en vez de morir', () => {
    // Si una versión futura de PresentMon renombrara la columna, exigirla dejaría los FPS muertos
    // del todo. Sin ella se pierde la calificación (peor) pero el contador sigue vivo (no roto).
    const { reader, fake, avanzar } = readerFalso();
    reader.start();
    // Cabecera hipotética sin la columna de modo: las filas van acordes a ella.
    fake.emitLine('Application,ProcessID,MsBetweenPresents');
    for (let i = 0; i < 60; i++) {
      avanzar(10);
      fake.emitLine('loquesea.exe,123,10');
    }
    expect(Math.round(reader.fps()!)).toBe(100);
  });

  it('tras morir, start() no lo relanza en caliente; stop() + start() sí fuerza', () => {
    // El relanzado automático es espaciado (ver «recuperación tras morir»): un `start()` inmediato
    // no debe adelantarlo. `stop()` borra el estado y por eso sí fuerza un intento ya.
    const { reader, fake, spawn } = readerFalso();
    reader.start();
    fake.emitExit(); // muerte temprana: sin permisos
    reader.start();
    expect(spawn).toHaveBeenCalledTimes(1);
    reader.stop();
    reader.start();
    expect(spawn).toHaveBeenCalledTimes(2);
  });
});

// ----------------------------------------------------------------------------------------- Sampler

function samplerFalso() {
  const sensors = {
    start: vi.fn(),
    stop: vi.fn(),
    latest: vi.fn().mockReturnValue({ ...EMPTY_SENSOR_READING, gpuUsage: 57, gpuTemp: 60 }),
  };
  const presentMon = {
    start: vi.fn(),
    stop: vi.fn(),
    fps: vi.fn().mockReturnValue(120),
    setDetectedGame: vi.fn(),
  };
  const gb = 1024 * 1024 * 1024;
  const osApi = {
    cpus: vi
      .fn()
      .mockReturnValueOnce(cpusFalsos(1000, 1000) as never)
      .mockReturnValue(cpusFalsos(1300, 1700) as never),
    totalmem: () => 16 * gb,
    freemem: () => 6 * gb,
  };
  const sampler = new PerfSampler({ sensors, presentMon, osApi, intervalMs: 60_000 });
  return { sampler, sensors, presentMon };
}

describe('PerfSampler', () => {
  it('pide el grupo de CPU solo si Temp CPU está marcada', () => {
    // El nudo de la tarea: marcar métricas de GPU NO debe abrir el grupo de CPU, porque abrirlo es
    // lo que lee los MSR y engancha PawnIO (anillo 0). Antes daba igual lo que marcaras.
    const { sampler, sensors } = samplerFalso();

    sampler.configure({ ...DEFAULT_PERF_OVERLAY.metrics, gpuUsage: true, vram: true, cpuTemp: false });
    expect(sensors.start).toHaveBeenLastCalledWith({ cpu: false });

    sampler.configure({ ...DEFAULT_PERF_OVERLAY.metrics, gpuUsage: true, cpuTemp: true });
    expect(sensors.start).toHaveBeenLastCalledWith({ cpu: true });

    sampler.stop();
  });

  it('sin ninguna métrica de sensores no lanza el helper', () => {
    const { sampler, sensors } = samplerFalso();

    sampler.configure({
      ...DEFAULT_PERF_OVERLAY.metrics,
      gpuUsage: false,
      gpuTemp: false,
      gpuFan: false,
      gpuVoltage: false,
      vram: false,
      cpuTemp: false,
      fps: true,
      cpuUsage: true,
      ram: true,
    });

    expect(sensors.start).not.toHaveBeenCalled();
    expect(sensors.stop).toHaveBeenCalled();
    sampler.stop();
  });

  it('sin sensor de temperatura de CPU, el resto de métricas sobrevive', () => {
    // Contrato de la degradación cuando falta PawnIO (o no se corre elevado): la temperatura del
    // procesador se lee de los MSR y sin anillo 0 vuelve null, pero eso NO puede arrastrar a las
    // demás — las de GPU van por NVAPI/ADL y las de CPU-uso/RAM ni pasan por el helper. Es lo que
    // hace que el aviso de PawnIO sea informativo y no un requisito para usar el overlay.
    const { sampler, sensors } = samplerFalso();
    sensors.latest.mockReturnValue({
      ...EMPTY_SENSOR_READING,
      gpuUsage: 57,
      gpuTemp: 60,
      vramUsedMb: 4096,
      vramTotalMb: 12288,
      cpuTemp: null, // <- lo único que se pierde sin el driver
    });
    const snapshots: PerfSnapshot[] = [];
    sampler.on('snapshot', (s: PerfSnapshot) => snapshots.push(s));

    sampler.configure({
      ...DEFAULT_PERF_OVERLAY.metrics,
      fps: true,
      gpuUsage: true,
      gpuTemp: true,
      vram: true,
      cpuUsage: true,
      cpuTemp: true,
      ram: true,
    });
    sampler.tick();
    sampler.tick();

    const s = snapshots[1];
    expect(s.cpuTemp).toBeNull();
    // Las otras ocho, intactas.
    expect(s.fps).toBe(120);
    expect(s.gpuUsage).toBe(57);
    expect(s.gpuTemp).toBe(60);
    expect(s.vramUsedMb).toBe(4096);
    expect(s.vramTotalMb).toBe(12288);
    expect(s.cpuUsage).toBe(70);
    expect(s.ramUsedMb).toBe(10 * 1024);
    sampler.stop();
  });

  it('emite snapshots solo con las métricas marcadas', () => {
    const { sampler, sensors } = samplerFalso();
    const snapshots: PerfSnapshot[] = [];
    sampler.on('snapshot', (s: PerfSnapshot) => snapshots.push(s));

    sampler.configure({ ...DEFAULT_PERF_OVERLAY.metrics, fps: true, gpuUsage: true, ram: true });
    sampler.tick(); // primera muestra de CPU: sin delta
    sampler.tick();

    const s = snapshots[1];
    expect(s.gpuUsage).toBe(57);
    expect(s.fps).toBe(120);
    expect(s.ramUsedMb).toBe(10 * 1024);
    expect(s.cpuUsage).toBe(70);
    // No marcadas: ni se miden ni se muestran.
    expect(s.gpuTemp).toBeNull();
    expect(sensors.start).toHaveBeenCalled();
    sampler.stop();
  });

  it('sin métricas de sensores no lanza el helper; apagar detiene todo', () => {
    const { sampler, sensors, presentMon } = samplerFalso();
    const soloCpu = {
      ...DEFAULT_PERF_OVERLAY.metrics,
      fps: false,
      gpuUsage: false,
      cpuUsage: true,
    };
    sampler.configure(soloCpu);
    expect(sensors.start).not.toHaveBeenCalled();
    expect(sensors.stop).toHaveBeenCalled();

    sampler.configure(null);
    expect(presentMon.stop).toHaveBeenCalled();
  });

  it('PresentMon vive solo mientras los FPS estén marcados (sin depender del juego)', () => {
    const { sampler, presentMon } = samplerFalso();
    sampler.configure({ ...DEFAULT_PERF_OVERLAY.metrics, fps: true });
    expect(presentMon.start).toHaveBeenCalled();

    sampler.configure({ ...DEFAULT_PERF_OVERLAY.metrics, fps: false });
    expect(presentMon.stop).toHaveBeenCalled();
    sampler.stop();
  });
});
