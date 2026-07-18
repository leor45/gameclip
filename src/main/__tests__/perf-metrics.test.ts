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
  csvNumberAt,
  msBetweenPresentsIndex,
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

describe('presentmon', () => {
  it('los args siguen al proceso por nombre, sin relanzarse como admin', () => {
    const args = presentMonArgs('cs2.exe');
    expect(args).toContain('-process_name');
    expect(args).toContain('cs2.exe');
    expect(args).toContain('-output_stdout');
    expect(args.join(' ')).not.toContain('restart_as_admin');
  });

  it('encuentra la columna msBetweenPresents en la cabecera CSV', () => {
    const header = 'Application,ProcessID,SwapChainAddress,SyncInterval,msBetweenPresents,msInPresentAPI';
    expect(msBetweenPresentsIndex(header)).toBe(4);
    expect(msBetweenPresentsIndex('a,b,c')).toBeNull();
  });

  it('csvNumberAt devuelve null para valores no numéricos', () => {
    expect(csvNumberAt('game.exe,123,16.66', 2)).toBeCloseTo(16.66);
    expect(csvNumberAt('game.exe,123,abc', 2)).toBeNull();
  });

  it('FpsTracker: media de la ventana y null cuando los datos envejecen', () => {
    const tracker = new FpsTracker();
    for (let i = 0; i < 10; i++) tracker.push(16.666, 1000 + i * 17);
    expect(Math.round(tracker.fps(1200)!)).toBe(60);
    // Sin presents nuevos en 3 s → null (juego parado en un menú, no "60 fps" viejos).
    expect(tracker.fps(6000)).toBeNull();
  });

  it('PresentMonReader parsea el CSV tras la cabecera y expone los FPS', () => {
    const fake = procesoFalso();
    let t = 0;
    const reader = new PresentMonReader({
      helperPath: () => 'C:\\pm.exe',
      spawn: () => fake.proc,
      now: () => t,
    });
    reader.setTarget('cs2.exe');
    fake.emitLine('Application,ProcessID,msBetweenPresents');
    for (t = 0; t <= 500; t += 10) fake.emitLine(`cs2.exe,123,${10}`);
    expect(Math.round(reader.fps()!)).toBe(100);
  });

  it('un target que falló no se reintenta, pero un juego nuevo sí', () => {
    const fake = procesoFalso();
    const spawn = vi.fn().mockReturnValue(fake.proc);
    const reader = new PresentMonReader({ helperPath: () => 'C:\\pm.exe', spawn, now: () => 0 });
    reader.setTarget('cs2.exe');
    fake.emitExit(); // muerte temprana: sin permisos
    reader.setTarget(null);
    reader.setTarget('cs2.exe');
    expect(spawn).toHaveBeenCalledTimes(1);
    reader.setTarget('otro.exe');
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
    setTarget: vi.fn(),
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

  it('el juego activo alimenta a PresentMon solo si los FPS están marcados', () => {
    const { sampler, presentMon } = samplerFalso();
    sampler.configure({ ...DEFAULT_PERF_OVERLAY.metrics, fps: true });
    sampler.setGameExe('cs2.exe');
    expect(presentMon.setTarget).toHaveBeenLastCalledWith('cs2.exe');

    sampler.configure({ ...DEFAULT_PERF_OVERLAY.metrics, fps: false });
    expect(presentMon.setTarget).toHaveBeenLastCalledWith(null);
    sampler.stop();
  });
});
