import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import * as childProcess from 'node:child_process';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { DEFAULT_PERF_OVERLAY, type PerfSnapshot } from '@shared/perf';
import { EMPTY_SENSOR_READING, SensorsReader, realSensorsSpawn } from '../perf-metrics/sensors';
import { PresentMonReader, realPresentMonSpawn } from '../perf-metrics/presentmon';
import { PerfSampler } from '../perf-metrics/sampler';
import { HapticMuteListener, realHapticMuteDeps } from '../capture/app-audio-mute';
import {
  ControllerCaptureListener,
  realControllerCaptureDeps,
} from '../capture/controller-capture';

// Regresión D5-BUG-4 por wrapper: los cuatro helpers nativos con su `spawn` REAL de Node (no un
// proceso falso), apuntando a rutas que fallan de las dos maneras que medimos:
// - un archivo que existe pero no es un ejecutable → `spawn` LANZA síncrono (EFTYPE);
// - una ruta que no existe → `spawn` devuelve el hijo y emite `'error'` (ENOENT) en el tick siguiente.
// `spawn` va espiado (pasa al real) solo para contar intentos y, en los tests del camino sano,
// devolver un hijo falso y comprobar que el contrato de siempre no cambió.

vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>();
  return { ...real, spawn: vi.fn(real.spawn) };
});
const spawnMock = vi.mocked(childProcess.spawn);
const intentos = (): number => spawnMock.mock.calls.length;

/** Deja correr los `process.nextTick` pendientes (ahí emite Node el `'error'` de un ENOENT). */
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const dir = mkdtempSync(join(tmpdir(), 'gameclip-helpers-spawn-'));
const NO_EJECUTABLE = join(dir, 'no-ejecutable.txt');
writeFileSync(NO_EJECUTABLE, 'esto no es un programa\r\n');
const NO_EXISTE = join(dir, 'no-existe.exe');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  spawnMock.mockClear();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

/**
 * La cadencia que ya tienen Sensores y PresentMon para un helper que se cae: 3 reintentos cada 5 s
 * y después uno por minuto. Un fallo al lanzar tiene que caer en ese mismo camino —nunca en un
 * bucle de relanzados en caliente—, así que se recorre entero contando intentos reales.
 */
async function comprobarCadenciaEspaciada(tick: () => void, avanzar: (ms: number) => void) {
  await flush(); // llega el aviso de fin del primer intento
  expect(intentos()).toBe(1);
  tick();
  expect(intentos()).toBe(1); // en caliente, no

  for (let n = 2; n <= 4; n++) {
    avanzar(4_999);
    tick();
    expect(intentos()).toBe(n - 1);
    avanzar(1);
    tick();
    expect(intentos()).toBe(n); // a los 5 s justos
    await flush();
    tick();
    expect(intentos()).toBe(n); // el nuevo fallo vuelve a esperar
  }

  avanzar(5_000);
  tick();
  expect(intentos()).toBe(4); // agotados los rápidos, 5 s ya no bastan
  avanzar(54_999);
  tick();
  expect(intentos()).toBe(4);
  avanzar(1);
  tick();
  expect(intentos()).toBe(5); // al minuto, otro
}

// ----------------------------------------------------------------------------------------- Sensores

describe('SensorsReader con realSensorsSpawn: el helper no se puede lanzar', () => {
  it('no es un ejecutable (spawn lanza): start() no lanza y reintenta espaciado', async () => {
    let t = 0;
    const reader = new SensorsReader({
      helperPath: () => NO_EJECUTABLE,
      spawn: realSensorsSpawn,
      now: () => t,
    });

    expect(() => reader.start({ cpu: false })).not.toThrow();
    await comprobarCadenciaEspaciada(
      () => reader.latest(),
      (ms) => (t += ms),
    );
    expect(reader.latest()).toEqual(EMPTY_SENSOR_READING);
    expect(() => reader.stop()).not.toThrow();
  });

  it('no existe (`error` asíncrono): sin excepción sin capturar y reintento a los 5 s', async () => {
    let t = 0;
    const reader = new SensorsReader({
      helperPath: () => NO_EXISTE,
      spawn: realSensorsSpawn,
      now: () => t,
    });

    reader.start({ cpu: true });
    await flush();
    reader.latest();
    expect(intentos()).toBe(1);
    t += 5_000;
    reader.latest();
    expect(intentos()).toBe(2);
    // Vuelve con el modo que tenía.
    expect(spawnMock.mock.calls[1][1]).toEqual(['--cpu']);
    await flush();
  });

  it('cambio de modo en el mismo tick de un lanzamiento fallido: kill() no lanza', async () => {
    const reader = new SensorsReader({ helperPath: () => NO_EXISTE, spawn: realSensorsSpawn });
    reader.start({ cpu: false });
    // El primero aún no ha emitido su 'error': matar un hijo sin pid hace lanzar EINVAL a Node.
    expect(() => reader.start({ cpu: true })).not.toThrow();
    expect(intentos()).toBe(2);
    expect(() => reader.stop()).not.toThrow();
    await flush();
  });
});

// --------------------------------------------------------------------------------------- PresentMon

describe('PresentMonReader con realPresentMonSpawn: el helper no se puede lanzar', () => {
  function reader(helper: string, now: () => number = () => 0) {
    return new PresentMonReader({
      helperPath: () => helper,
      spawn: realPresentMonSpawn,
      closeSession: vi.fn(),
      selfExe: () => 'GameClip.exe',
      now,
    });
  }

  it('no es un ejecutable (spawn lanza): start() no lanza y reintenta espaciado', async () => {
    let t = 0;
    const pm = reader(NO_EJECUTABLE, () => t);

    expect(() => pm.start()).not.toThrow();
    await comprobarCadenciaEspaciada(
      () => pm.fps(),
      (ms) => (t += ms),
    );
    expect(pm.fps()).toBeNull();
    expect(() => pm.stop()).not.toThrow();
  });

  it('no existe (`error` asíncrono): sin excepción sin capturar y reintento a los 5 s', async () => {
    let t = 0;
    const pm = reader(NO_EXISTE, () => t);

    pm.start();
    await flush();
    pm.fps();
    expect(intentos()).toBe(1);
    t += 5_000;
    pm.fps();
    expect(intentos()).toBe(2);
    await flush();
  });

  it('stop() en el mismo tick de un lanzamiento fallido no lanza', async () => {
    const pm = reader(NO_EXISTE);
    pm.start();
    expect(() => pm.stop()).not.toThrow();
    await flush();
  });
});

// ---------------------------------------------------------------------------------------- Sampler

describe('PerfSampler: arranque de la app con los helpers rotos', () => {
  it('configure() no lanza (corre antes de la bandeja, el IPC y la ventana) y los ticks dan «—»', async () => {
    const sampler = new PerfSampler({
      sensors: new SensorsReader({ helperPath: () => NO_EJECUTABLE, spawn: realSensorsSpawn }),
      presentMon: new PresentMonReader({
        helperPath: () => NO_EJECUTABLE,
        spawn: realPresentMonSpawn,
        closeSession: vi.fn(),
        selfExe: () => 'GameClip.exe',
      }),
      intervalMs: 3_600_000,
    });
    const snapshots: PerfSnapshot[] = [];
    sampler.on('snapshot', (s: PerfSnapshot) => snapshots.push(s));

    expect(() =>
      sampler.configure({
        ...DEFAULT_PERF_OVERLAY.metrics,
        fps: true,
        gpuUsage: true,
        cpuTemp: true,
      }),
    ).not.toThrow();
    await flush();
    expect(() => sampler.tick()).not.toThrow();
    expect(snapshots[0].fps).toBeNull();
    expect(snapshots[0].gpuUsage).toBeNull();
    expect(snapshots[0].cpuTemp).toBeNull();
    sampler.stop();
  });
});

// ----------------------------------------------------------------------------- Háptico y mandos

describe('HapticMuteListener con el spawn real: el helper no se puede lanzar', () => {
  const nuevo = (helper: string) =>
    new HapticMuteListener({ helperPath: () => helper, spawn: realHapticMuteDeps().spawn });

  it('no es un ejecutable: apply() no lanza, no se relanza solo y el siguiente apply lo reintenta', async () => {
    const listener = nuevo(NO_EJECUTABLE);
    expect(() => listener.apply(true, 'DualSense')).not.toThrow();
    await flush();
    await flush();
    expect(intentos()).toBe(1); // nada lo relanza por su cuenta
    listener.apply(true, 'DualSense'); // el siguiente guardado de ajustes
    expect(intentos()).toBe(2);
    await flush();
    expect(() => listener.stop()).not.toThrow();
  });

  it('no existe (`error` asíncrono): se olvida el proceso muerto y el siguiente apply lo reintenta', async () => {
    const listener = nuevo(NO_EXISTE);
    listener.apply(true, 'DualSense');
    await flush();
    listener.apply(true, 'DualSense');
    expect(intentos()).toBe(2);
    await flush();
  });

  it('stop() en el mismo tick de un lanzamiento fallido no lanza', async () => {
    const listener = nuevo(NO_EXISTE);
    listener.apply(true, 'DualSense');
    expect(() => listener.stop()).not.toThrow();
    await flush();
  });
});

describe('ControllerCaptureListener con el spawn real: el helper no se puede lanzar', () => {
  const nuevo = (helper: string) =>
    new ControllerCaptureListener({
      helperPath: () => helper,
      spawn: realControllerCaptureDeps().spawn,
    });

  it('no es un ejecutable: apply() no lanza, no se relanza solo y el siguiente apply lo reintenta', async () => {
    const listener = nuevo(NO_EJECUTABLE);
    const onCapture = vi.fn();
    expect(() => listener.apply(true, onCapture)).not.toThrow();
    await flush();
    await flush();
    expect(intentos()).toBe(1);
    listener.apply(true, onCapture);
    expect(intentos()).toBe(2);
    await flush();
    expect(() => listener.stop()).not.toThrow();
    expect(onCapture).not.toHaveBeenCalled();
  });

  it('no existe (`error` asíncrono): se olvida el proceso muerto y el siguiente apply lo reintenta', async () => {
    const listener = nuevo(NO_EXISTE);
    listener.apply(true, vi.fn());
    await flush();
    listener.apply(true, vi.fn());
    expect(intentos()).toBe(2);
    await flush();
  });

  it('stop() en el mismo tick de un lanzamiento fallido no lanza', async () => {
    const listener = nuevo(NO_EXISTE);
    listener.apply(true, vi.fn());
    expect(() => listener.stop()).not.toThrow();
    await flush();
  });
});

// ------------------------------------------------------- Camino sano: el contrato no cambia

/** Hijo sano falso: con pid, stdout/stdin reales (PassThrough) y kill espiado. */
function hijoSano() {
  return Object.assign(new EventEmitter(), {
    pid: 4242,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    kill: vi.fn(() => true),
  });
}

function devolverHijo(hijo: ReturnType<typeof hijoSano>): void {
  spawnMock.mockImplementationOnce((() => hijo) as unknown as typeof childProcess.spawn);
}

describe('wrappers con un proceso sano: mismas opciones, líneas, exit y kill de siempre', () => {
  it('realSensorsSpawn', async () => {
    const hijo = hijoSano();
    devolverHijo(hijo);
    const proc = realSensorsSpawn('C:\\gc-perf-sensors.exe', ['--cpu']);
    expect(spawnMock).toHaveBeenCalledWith('C:\\gc-perf-sensors.exe', ['--cpu'], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const lineas: string[] = [];
    const fin = vi.fn();
    proc.onLine((l) => lineas.push(l));
    proc.onExit(fin);
    hijo.stdout.write('{"gpuUsage":50}\n');
    await flush();
    expect(lineas).toEqual(['{"gpuUsage":50}']);
    hijo.emit('exit', 0, null);
    expect(fin).toHaveBeenCalledTimes(1);
    proc.kill();
    expect(hijo.kill).toHaveBeenCalledTimes(1);
  });

  it('realPresentMonSpawn', async () => {
    const hijo = hijoSano();
    devolverHijo(hijo);
    const proc = realPresentMonSpawn('C:\\gc-presentmon.exe', ['--output_stdout']);
    expect(spawnMock).toHaveBeenCalledWith('C:\\gc-presentmon.exe', ['--output_stdout'], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const lineas: string[] = [];
    const fin = vi.fn();
    proc.onLine((l) => lineas.push(l));
    proc.onExit(fin);
    hijo.stdout.write('Application,MsBetweenPresents\r\n');
    await flush();
    expect(lineas).toEqual(['Application,MsBetweenPresents']);
    hijo.emit('exit', 0, null);
    expect(fin).toHaveBeenCalledTimes(1);
    proc.kill();
    expect(hijo.kill).toHaveBeenCalledTimes(1);
  });

  it('háptico (realHapticMuteDeps().spawn)', () => {
    const hijo = hijoSano();
    devolverHijo(hijo);
    const proc = realHapticMuteDeps().spawn('C:\\gc-app-audio-mute.exe', ['--watch']);
    expect(spawnMock).toHaveBeenCalledWith('C:\\gc-app-audio-mute.exe', ['--watch'], {
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    const fin = vi.fn();
    proc.on('exit', fin);
    hijo.emit('exit', 0, null);
    expect(fin).toHaveBeenCalledTimes(1);
    proc.kill();
    expect(hijo.kill).toHaveBeenCalledTimes(1);
  });

  it('mandos (realControllerCaptureDeps().spawn)', async () => {
    const hijo = hijoSano();
    devolverHijo(hijo);
    const proc = realControllerCaptureDeps().spawn('C:\\gc-controller-listen.exe');
    expect(spawnMock).toHaveBeenCalledWith('C:\\gc-controller-listen.exe', [], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const lineas: string[] = [];
    const fin = vi.fn();
    proc.onLine((l) => lineas.push(l));
    proc.on('exit', fin);
    hijo.stdout.write('capture\r\nca');
    hijo.stdout.write('pture\n');
    await flush();
    expect(lineas).toEqual(['capture', 'capture']);
    hijo.emit('exit', 0, null);
    expect(fin).toHaveBeenCalledTimes(1);
    proc.kill();
    expect(hijo.kill).toHaveBeenCalledTimes(1);
  });
});
