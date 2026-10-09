import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
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
import { safeSpawn, type SafeChild, type SpawnFn } from '../safe-spawn';

// Regresión D5-BUG-4: un fallo al lanzar un helper nativo tumbaba el proceso principal. `spawn`
// falla de dos formas —lanza síncrono (EFTYPE: no es un ejecutable válido) o emite `'error'`
// (ENOENT)— y los cuatro wrappers no cubrían ninguna.

/** Deja correr los `process.nextTick` pendientes (y lo que Node encole en ellos). */
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function errorDeSpawn(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`spawn ${code}`), { code, syscall: 'spawn' });
}

/**
 * ChildProcess falso. `pid` undefined = no llegó a arrancar, que es como lo deja Node cuando el
 * lanzamiento falla. Su `kill()` imita a Node: sin pid lanza EINVAL (medido con Node real en el
 * mismo tick de un spawn ENOENT).
 */
function hijoFalso(pid: number | undefined) {
  const hijo = Object.assign(new EventEmitter(), {
    pid,
    kill: vi.fn((): boolean => {
      if (hijo.pid === undefined) throw errorDeSpawn('EINVAL');
      return true;
    }),
  });
  return hijo;
}

/** spawn inyectable que devuelve siempre el hijo dado. */
function spawnQueDevuelve(hijo: ReturnType<typeof hijoFalso>) {
  return vi.fn<SpawnFn>(() => hijo as unknown as ChildProcess);
}

let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

describe('safeSpawn — el lanzamiento falla', () => {
  it('(a) spawn lanza síncrono: no propaga y avisa UNA vez, después de que el llamador se suscriba', async () => {
    const spawnFn = vi.fn<SpawnFn>(() => {
      throw errorDeSpawn('EFTYPE');
    });
    let proc: SafeChild | null = null;
    expect(() => {
      proc = safeSpawn('gc-x.exe', 'C:\\x.exe', [], {}, spawnFn);
    }).not.toThrow();
    const fin = vi.fn();
    // Como los readers: se suscriben DESPUÉS de que spawn devuelva.
    proc!.onEnd(fin);
    expect(fin).not.toHaveBeenCalled(); // nunca dentro de la propia llamada

    await flush();
    expect(fin).toHaveBeenCalledTimes(1);
    expect(proc!.child).toBeNull();

    await flush();
    expect(fin).toHaveBeenCalledTimes(1);
  });

  it('(b) solo `error` (ENOENT, sin pid): un único fin', async () => {
    const hijo = hijoFalso(undefined);
    const proc = safeSpawn('gc-x.exe', 'C:\\x.exe', [], {}, spawnQueDevuelve(hijo));
    const fin = vi.fn();
    proc.onEnd(fin);

    // Node lo emite en el tick siguiente; aquí a mano. Sin listener de 'error' esto lanzaría.
    expect(() => hijo.emit('error', errorDeSpawn('ENOENT'))).not.toThrow();
    hijo.emit('close');
    await flush();
    expect(fin).toHaveBeenCalledTimes(1);
  });

  it('(c) `error` y después `exit`: un único fin', async () => {
    const hijo = hijoFalso(undefined);
    const proc = safeSpawn('gc-x.exe', 'C:\\x.exe', [], {}, spawnQueDevuelve(hijo));
    const fin = vi.fn();
    proc.onEnd(fin);

    hijo.emit('error', errorDeSpawn('ENOENT'));
    hijo.emit('exit', -4058, null);
    await flush();
    expect(fin).toHaveBeenCalledTimes(1);
  });

  it('(c bis) proceso vivo cuyo kill falla (`error` con pid) y luego sale: un único fin, el del `exit`', () => {
    // Con pid, el 'error' viene de un kill() fallido: el proceso SIGUE vivo y no puede darse por
    // terminado (el reader lo relanzaría con el viejo aún corriendo). Su 'exit' llega cuando muera.
    const hijo = hijoFalso(4242);
    const proc = safeSpawn('gc-x.exe', 'C:\\x.exe', [], {}, spawnQueDevuelve(hijo));
    const fin = vi.fn();
    proc.onEnd(fin);

    expect(() => hijo.emit('error', errorDeSpawn('EPERM'))).not.toThrow();
    expect(fin).not.toHaveBeenCalled();
    hijo.emit('exit', 1, null);
    expect(fin).toHaveBeenCalledTimes(1);
  });

  it('(d) kill() de un proceso que nunca arrancó es un no-op seguro', async () => {
    const lanza = safeSpawn('gc-x.exe', 'C:\\x.exe', [], {}, () => {
      throw errorDeSpawn('EFTYPE');
    });
    expect(() => lanza.kill()).not.toThrow();

    // ENOENT: en el mismo tick del spawn el kill() de Node lanza EINVAL (sin pid); no se le llama.
    const hijo = hijoFalso(undefined);
    const sinPid = safeSpawn('gc-x.exe', 'C:\\x.exe', [], {}, spawnQueDevuelve(hijo));
    expect(() => sinPid.kill()).not.toThrow();
    expect(hijo.kill).not.toHaveBeenCalled();

    // Y el aviso de fin sigue llegando una vez aunque se le haya matado antes.
    const fin = vi.fn();
    sinPid.onEnd(fin);
    hijo.emit('error', errorDeSpawn('ENOENT'));
    expect(() => sinPid.kill()).not.toThrow();
    await flush();
    expect(fin).toHaveBeenCalledTimes(1);
  });

  it('registra cada fallo una sola vez, con el nombre del helper y el código, sin stack', async () => {
    safeSpawn('gc-perf-sensors.exe', 'C:\\x.exe', [], {}, () => {
      throw errorDeSpawn('EFTYPE');
    });
    await flush();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]).toHaveLength(1);
    expect(warn.mock.calls[0][0]).toContain('gc-perf-sensors.exe');
    expect(warn.mock.calls[0][0]).toContain('EFTYPE');
    expect(warn.mock.calls[0][0]).not.toContain('    at '); // sin stack

    warn.mockClear();
    const hijo = hijoFalso(undefined);
    safeSpawn('gc-presentmon.exe', 'C:\\x.exe', [], {}, spawnQueDevuelve(hijo));
    hijo.emit('error', errorDeSpawn('ENOENT'));
    hijo.emit('exit', -4058, null);
    await flush();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]).toHaveLength(1);
    expect(warn.mock.calls[0][0]).toContain('gc-presentmon.exe');
    expect(warn.mock.calls[0][0]).toContain('ENOENT');
  });
});

describe('safeSpawn — proceso sano (comportamiento de siempre)', () => {
  it('pasa exe, args y opciones tal cual a spawn', () => {
    const hijo = hijoFalso(4242);
    const spawnFn = spawnQueDevuelve(hijo);
    const opciones = { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] as const };
    const proc = safeSpawn(
      'gc-x.exe',
      'C:\\x.exe',
      ['--cpu'],
      { ...opciones, stdio: [...opciones.stdio] },
      spawnFn,
    );
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(spawnFn).toHaveBeenCalledWith('C:\\x.exe', ['--cpu'], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    expect(proc.child).toBe(hijo);
  });

  it('`exit` se entrega en el propio evento (síncrono, como antes) y una sola vez', () => {
    const hijo = hijoFalso(4242);
    const proc = safeSpawn('gc-x.exe', 'C:\\x.exe', [], {}, spawnQueDevuelve(hijo));
    const fin = vi.fn();
    proc.onEnd(fin);
    hijo.emit('exit', 0, null);
    expect(fin).toHaveBeenCalledTimes(1);
    hijo.emit('exit', 0, null);
    expect(fin).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled(); // salir no es un fallo
  });

  it('kill() delega en el kill() del proceso vivo', () => {
    const hijo = hijoFalso(4242);
    const proc = safeSpawn('gc-x.exe', 'C:\\x.exe', [], {}, spawnQueDevuelve(hijo));
    proc.kill();
    expect(hijo.kill).toHaveBeenCalledTimes(1);
  });

  it('cada suscriptor recibe un único aviso, también el que se suscribe tarde', async () => {
    const hijo = hijoFalso(4242);
    const proc = safeSpawn('gc-x.exe', 'C:\\x.exe', [], {}, spawnQueDevuelve(hijo));
    const a = vi.fn();
    const b = vi.fn();
    proc.onEnd(a);
    proc.onEnd(b);
    hijo.emit('exit', 0, null);
    const tarde = vi.fn();
    proc.onEnd(tarde);
    await flush();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(tarde).toHaveBeenCalledTimes(1);
  });
});

describe('safeSpawn — con el spawn real de Node', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gameclip-safe-spawn-'));
  /** Archivo que existe pero no es un ejecutable: Node lanza síncrono (EFTYPE en Windows). */
  const noEjecutable = join(dir, 'no-ejecutable.txt');
  writeFileSync(noEjecutable, 'esto no es un programa\r\n');
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('un archivo que no es ejecutable ni lanza ni se queda sin aviso de fin', async () => {
    let proc: SafeChild | null = null;
    expect(() => {
      proc = safeSpawn('gc-x.exe', noEjecutable, [], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
    }).not.toThrow();
    const fin = vi.fn();
    proc!.onEnd(fin);
    expect(() => proc!.kill()).not.toThrow();
    await flush();
    expect(fin).toHaveBeenCalledTimes(1);
  });

  it('una ruta inexistente (`error` asíncrono) da un único fin y kill() no lanza', async () => {
    const proc = safeSpawn('gc-x.exe', join(dir, 'no-existe.exe'), [], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const fin = vi.fn();
    proc.onEnd(fin);
    expect(() => proc.kill()).not.toThrow(); // mismo tick: el kill() de Node lanzaría EINVAL
    await flush();
    expect(fin).toHaveBeenCalledTimes(1);
    expect(() => proc.kill()).not.toThrow();
  });
});
