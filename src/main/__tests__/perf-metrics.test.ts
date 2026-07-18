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

  it('tras morir no se relanza solo, pero stop() + start() sí reintenta', () => {
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
});

// -------------------------------------------------------------------------------------- PresentMon

// Cabecera real de PresentMon 2.5.1 (recortada): las columnas que leemos van en 0 y 11.
const CABECERA =
  'Application,ProcessID,SwapChainAddress,PresentRuntime,SyncInterval,PresentFlags,AllowsTearing,PresentMode,FrameType,TimeInMs,MsBetweenSimulationStart,MsBetweenPresents,MsBetweenDisplayChange';

/** Fila CSV con el layout de PresentMon 2.x (MsBetweenPresents en la columna 11). */
function fila(exe: string, ms: number): string {
  return [exe, '123', '0x0', 'DXGI', '0', '0', '0', 'Composed: Flip', 'Application', '0', '0', String(ms), String(ms)].join(',');
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
    presentar: (exe: string, ms: number, n: number) => {
      for (let i = 0; i < n; i++) {
        t += ms;
        fake.emitLine(fila(exe, ms));
      }
    },
  };
}

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
    expect(parseCsvHeader(CABECERA)).toEqual({ application: 0, msBetweenPresents: 11 });
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
    presentar('eden.exe', 10, 60);
    expect(Math.round(reader.fps()!)).toBe(100);
  });

  it('mantiene la app enganchada frente a otra algo más rápida (sin saltos)', () => {
    const { reader, fake, presentar } = readerFalso();
    reader.start();
    fake.emitLine(CABECERA);
    // El juego se engancha a 33 ms (~30 fps), como un emulador capado.
    presentar('eden.exe', 33, 40);
    expect(Math.round(reader.fps()!)).toBe(30);

    // Otra app a ~35 fps: está por encima pero no supera el margen → no roba la lectura.
    for (let i = 0; i < 40; i++) {
      presentar('eden.exe', 33, 1);
      fake.emitLine(fila('chrome.exe', 28.5));
    }
    expect(Math.round(reader.fps()!)).toBe(30);
  });

  it('regresión: no se queda pegado a una app de escritorio con el juego mucho más rápido', () => {
    // Caso real medido: el overlay marcaba 52 fps (Discord) con el juego a 129, porque el enganche
    // era permanente y al arrancar antes que el juego se pegó a Discord para siempre.
    const { reader, fake, presentar, avanzar } = readerFalso();
    reader.start();
    fake.emitLine(CABECERA);

    // Solo Discord presenta al principio (el juego aún no arrancó): se engancha a él.
    presentar('discord.exe', 18.2, 60);
    expect(Math.round(reader.fps()!)).toBe(55);

    // Arranca el juego a ~130 fps mientras Discord sigue a sus ~55: debe robarle el enganche.
    for (let i = 0; i < 130; i++) {
      avanzar(7.7);
      fake.emitLine(fila('re9demo.exe', 7.7));
      if (i % 2 === 0) fake.emitLine(fila('discord.exe', 18.2));
    }
    expect(Math.round(reader.fps()!)).toBe(130);
  });

  it('re-engancha al de mayor tasa cuando el enganchado deja de presentar', () => {
    const { reader, fake, presentar, avanzar } = readerFalso();
    reader.start();
    fake.emitLine(CABECERA);
    presentar('eden.exe', 33, 40);
    expect(Math.round(reader.fps()!)).toBe(30);

    // El emulador se cierra; sigue habiendo otra app presentando.
    avanzar(6000);
    presentar('otrojuego.exe', 10, 60);
    expect(Math.round(reader.fps()!)).toBe(100);
  });

  it('sin nada presentando devuelve null (el overlay pinta «—»)', () => {
    const { reader, fake, presentar, avanzar } = readerFalso();
    reader.start();
    fake.emitLine(CABECERA);
    presentar('eden.exe', 16, 40);
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

  it('tras morir no se relanza solo, pero stop() + start() reintenta', () => {
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
