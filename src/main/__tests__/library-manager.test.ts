import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipsRepository } from '../library/clips-repository';
import { LibraryManager } from '../library/manager';

const dir = mkdtempSync(join(tmpdir(), 'gameclip-library-'));
const outputDir = join(dir, 'salida');
const db = new Database(':memory:');
const repo = new ClipsRepository(db);

afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec('DELETE FROM clips;');
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });
});

function crearManager(foreground: string | null = null) {
  return new LibraryManager(repo, {
    thumbnailsDir: join(dir, 'thumbs'),
    getForegroundTitle: () => Promise.resolve(foreground),
  });
}

function video(nombre: string): string {
  const ruta = join(outputDir, nombre);
  writeFileSync(ruta, 'contenido-de-video');
  return ruta;
}

describe('LibraryManager — ingesta', () => {
  it('registra un clip guardado con juego detectado y emite changed', async () => {
    const manager = crearManager('Valorant');
    const cambio = vi.fn();
    manager.on('changed', cambio);

    const clip = await manager.registerSavedClip(video('Replay 2026.mp4'), 'replay');

    expect(clip?.title).toBe('Replay 2026');
    expect(clip?.game).toBe('Valorant');
    expect(clip?.source).toBe('replay');
    expect(clip?.sizeBytes).toBeGreaterThan(0);
    expect(cambio).toHaveBeenCalledOnce();
  });

  it('ignora rutas inexistentes o ya registradas', async () => {
    const manager = crearManager();
    const ruta = video('clip.mp4');

    expect(await manager.registerSavedClip(join(outputDir, 'nada.mp4'), 'replay')).toBeNull();
    await manager.registerSavedClip(ruta, 'replay');
    expect(await manager.registerSavedClip(ruta, 'recording')).toBeNull();
    expect(manager.list()).toHaveLength(1);
  });
});

describe('LibraryManager — reconciliación', () => {
  it('agrega archivos nuevos y elimina filas sin archivo, conservando el resto', async () => {
    const manager = crearManager();
    const conservado = video('conservado.mp4');
    const borrado = video('borrado.mp4');
    const clipConservado = (await manager.registerSavedClip(conservado, 'replay'))!;
    await manager.registerSavedClip(borrado, 'replay');
    manager.updateClip(clipConservado.id, { title: 'renombrado' });

    rmSync(borrado, { force: true });
    video('nuevo.mp4');
    writeFileSync(join(outputDir, 'notas.txt'), 'no es video');

    const resultado = manager.reconcile(outputDir);

    expect(resultado).toEqual({ added: 1, removed: 1 });
    const titulos = manager.list().map((c) => c.title);
    expect(titulos).toContain('renombrado');
    expect(titulos).toContain('nuevo');
    expect(titulos).not.toContain('borrado');
  });
});

describe('LibraryManager — gestión', () => {
  it('setClipMedia escribe el thumbnail y guarda la duración', async () => {
    const manager = crearManager();
    const clip = (await manager.registerSavedClip(video('c.mp4'), 'replay'))!;
    const dataUrl = `data:image/jpeg;base64,${Buffer.from('jpeg-falso').toString('base64')}`;

    const actualizado = manager.setClipMedia(clip.id, {
      durationSeconds: 12.3,
      thumbnailDataUrl: dataUrl,
    });

    expect(actualizado.durationSeconds).toBe(12.3);
    expect(actualizado.thumbnailPath).not.toBeNull();
    expect(readFileSync(actualizado.thumbnailPath!, 'utf8')).toBe('jpeg-falso');
  });

  it('rechaza thumbnails que no sean data URL JPEG', async () => {
    const manager = crearManager();
    const clip = (await manager.registerSavedClip(video('d.mp4'), 'replay'))!;
    expect(() =>
      manager.setClipMedia(clip.id, { thumbnailDataUrl: 'data:text/html;base64,xx' }),
    ).toThrow(/thumbnail/i);
  });

  it('deleteClip borra archivo, thumbnail y registro', async () => {
    const manager = crearManager();
    const ruta = video('e.mp4');
    const clip = (await manager.registerSavedClip(ruta, 'replay'))!;
    const dataUrl = `data:image/jpeg;base64,${Buffer.from('x').toString('base64')}`;
    const conThumb = manager.setClipMedia(clip.id, { thumbnailDataUrl: dataUrl });

    manager.deleteClip(clip.id);

    expect(manager.list()).toHaveLength(0);
    expect(existsSync(ruta)).toBe(false);
    expect(existsSync(conThumb.thumbnailPath!)).toBe(false);
  });

  it('updateClip valida el patch (título vacío lanza)', async () => {
    const manager = crearManager();
    const clip = (await manager.registerSavedClip(video('f.mp4'), 'replay'))!;
    expect(() => manager.updateClip(clip.id, { title: '  ' })).toThrow(/título/i);
  });
});
