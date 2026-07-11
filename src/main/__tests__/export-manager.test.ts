import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { ExportManager, type FfmpegProcess } from '../export/manager';

const dir = mkdtempSync(join(tmpdir(), 'gameclip-export-'));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

class FakeFfmpeg extends EventEmitter implements FfmpegProcess {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;
  kill(): boolean {
    this.killed = true;
    // ffmpeg muere con código ≠ 0 al recibir SIGKILL
    setImmediate(() => this.emit('close', 1));
    return true;
  }
}

function job(outputPath = join(dir, 'salida.mp4')) {
  return {
    inputPath: join(dir, 'entrada.mp4'),
    outputPath,
    startSeconds: 0,
    endSeconds: 10,
    format: 'mp4' as const,
    quality: 'media' as const,
  };
}

function crear() {
  const fake = new FakeFfmpeg();
  const spawnFn = vi.fn().mockReturnValue(fake);
  const manager = new ExportManager('C:\\ffmpeg.exe', spawnFn);
  return { fake, spawnFn, manager };
}

describe('ExportManager', () => {
  it('resuelve done con la ruta de salida y progreso final 1', async () => {
    const { fake, manager } = crear();
    const progreso = vi.fn();
    manager.on('progress', progreso);

    const promesa = manager.run(job());
    // out_time_ms está en microsegundos: 5 s de 10 s = 0.5
    fake.stdout.emit('data', 'frame=100\nout_time_ms=5000000\n');
    fake.emit('close', 0);

    const resultado = await promesa;
    expect(resultado).toEqual({ status: 'done', outputPath: join(dir, 'salida.mp4') });
    expect(progreso).toHaveBeenCalledWith({ ratio: 0.5 });
    expect(progreso).toHaveBeenLastCalledWith({ ratio: 1 });
    expect(manager.isBusy).toBe(false);
  });

  it('cancel mata el proceso, limpia el parcial y resuelve canceled', async () => {
    const { fake, manager } = crear();
    const parcial = join(dir, 'parcial.mp4');
    writeFileSync(parcial, 'a-medias');

    const promesa = manager.run(job(parcial));
    manager.cancel();

    const resultado = await promesa;
    expect(resultado).toEqual({ status: 'canceled' });
    expect(fake.killed).toBe(true);
    expect(existsSync(parcial)).toBe(false);
  });

  it('código distinto de 0 resuelve error con la última línea de stderr', async () => {
    const { fake, manager } = crear();

    const promesa = manager.run(job());
    fake.stderr.emit('data', 'algo\nInvalid data found when processing input\n');
    fake.emit('close', 1);

    const resultado = await promesa;
    expect(resultado.status).toBe('error');
    expect(resultado.message).toMatch(/invalid data/i);
  });

  it('rechaza una segunda exportación concurrente', async () => {
    const { fake, manager } = crear();

    const primera = manager.run(job());
    const segunda = await manager.run(job(join(dir, 'otra.mp4')));

    expect(segunda.status).toBe('error');
    expect(segunda.message).toMatch(/en curso/i);
    fake.emit('close', 0);
    await primera;
  });

  it('fallo al spawnear resuelve error', async () => {
    const manager = new ExportManager('C:\\no-existe.exe', () => {
      throw new Error('ENOENT');
    });
    const resultado = await manager.run(job());
    expect(resultado.status).toBe('error');
  });
});
