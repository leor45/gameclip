import * as childProcess from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { foregroundWindowArgs, getForegroundWindowTitle } from '../library/foreground';

// `execFile` va espiado (pasa al real por defecto): los tests de abajo lo sustituyen puntualmente.
vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>();
  return { ...real, execFile: vi.fn(real.execFile) };
});
const execFileMock = vi.mocked(childProcess.execFile);

afterEach(() => {
  execFileMock.mockReset();
});

describe('foregroundWindowArgs (título de la ventana en primer plano)', () => {
  it('fuerza la salida de PowerShell a UTF-8 antes de escribir el título (regresión D5-BUG-5)', () => {
    // Sin esto PowerShell escribe en la codepage OEM de la consola (850 en un Windows en español) y
    // Node lo decodifica como UTF-8: en «Pokémon» la é llegaba como U+FFFD (medido) y el auto-cambio
    // de juego no reconocía por título a los juegos con acentos.
    const args = foregroundWindowArgs();
    expect(args).toHaveLength(4);
    expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-Command']);
    const script = args[3];
    const utf8 = script.indexOf('[Console]::OutputEncoding = [Text.Encoding]::UTF8');
    expect(utf8).toBeGreaterThanOrEqual(0);
    expect(utf8).toBeLessThan(script.indexOf('Write-Output'));
  });
});

describe('getForegroundWindowTitle (best-effort: cualquier fallo devuelve null)', () => {
  /** Hace que `execFile` termine al instante con esa salida (o ese error), como un PowerShell que responde. */
  function respondeCon(stdout: string, err: Error | null = null): void {
    execFileMock.mockImplementation(((_file: string, _args: unknown, _opts: unknown, cb: unknown) => {
      (cb as (e: Error | null, out: string) => void)(err, stdout);
      return { on: () => undefined };
    }) as unknown as typeof childProcess.execFile);
  }

  it('si execFile lanza en síncrono, resuelve null en vez de rechazar (regresión Bug 8)', async () => {
    // Un fallo de spawn síncrono dentro del executor rechazaba la promesa, y en el intervalo del
    // auto-cambio de juego nadie la capturaba.
    execFileMock.mockImplementation(() => {
      throw new Error('spawn EFTYPE');
    });
    await expect(getForegroundWindowTitle()).resolves.toBeNull();
  });

  it('devuelve el título de la ventana activa', async () => {
    respondeCon(`${process.pid + 1}|Hades\r\n`);
    await expect(getForegroundWindowTitle()).resolves.toBe('Hades');
  });

  it('null si la ventana es la de la propia app, si no hay título o si PowerShell falla', async () => {
    respondeCon(`${process.pid}|GameClip\r\n`);
    await expect(getForegroundWindowTitle()).resolves.toBeNull();
    respondeCon('');
    await expect(getForegroundWindowTitle()).resolves.toBeNull();
    respondeCon('', new Error('timeout'));
    await expect(getForegroundWindowTitle()).resolves.toBeNull();
  });
});
