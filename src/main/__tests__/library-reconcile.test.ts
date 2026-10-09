import * as fs from 'node:fs';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipsRepository } from '../library/clips-repository';
import { LibraryManager } from '../library/manager';

// Pass-through: las funciones reales, espiables. Cada test que necesita un fallo del disco (una
// carpeta sin permiso, un archivo que desaparece) lo inyecta solo para la ruta que le interesa.
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  return {
    ...real,
    existsSync: vi.fn(real.existsSync),
    readdirSync: vi.fn(real.readdirSync),
    statSync: vi.fn(real.statSync),
  };
});

const real = await vi.importActual<typeof import('node:fs')>('node:fs');

const dir = mkdtempSync(join(tmpdir(), 'gameclip-reconcile-'));
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

afterEach(() => {
  vi.mocked(existsSync).mockImplementation(real.existsSync);
  vi.mocked(readdirSync).mockImplementation(real.readdirSync);
  vi.mocked(statSync).mockImplementation(real.statSync);
});

function crearManager() {
  return new LibraryManager(repo, { thumbnailsDir: join(dir, 'thumbs') });
}

function archivo(...segmentos: string[]): string {
  const ruta = join(outputDir, ...segmentos);
  mkdirSync(join(ruta, '..'), { recursive: true });
  writeFileSync(ruta, 'contenido-de-video');
  return ruta;
}

function errorFs(code: string, syscall: string, path: string): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error(`${code}: ${syscall} '${path}'`);
  err.code = code;
  err.syscall = syscall;
  err.path = path;
  return err;
}

/** `readdirSync` real salvo para `bloqueada`, que lanza EPERM como `E:\System Volume Information`. */
function sinPermisoEn(bloqueada: string): void {
  vi.mocked(readdirSync).mockImplementation(((path: fs.PathLike, opts?: unknown) => {
    if (String(path) === bloqueada) throw errorFs('EPERM', 'scandir', bloqueada);
    return real.readdirSync(path, opts as never);
  }) as typeof readdirSync);
}

/** Una letra de unidad que no existe en esta máquina: la de un USB sin enchufar. */
function unidadAusente(): string {
  for (const letra of 'ZYXWVUTSRQPONMLKJIH') {
    if (!real.existsSync(`${letra}:\\`)) return `${letra}:\\`;
  }
  throw new Error('No queda ninguna letra de unidad libre para simular un USB desenchufado.');
}

function insertar(filePath: string, title = 'clip') {
  return repo.insert({
    filePath,
    title,
    game: 'Fortnite',
    sizeBytes: 1234,
    createdAt: new Date('2026-07-01T10:00:00Z').toISOString(),
    source: 'replay',
  });
}

const dataUrl = `data:image/jpeg;base64,${Buffer.from('jpeg-falso').toString('base64')}`;

describe('LibraryManager.reconcile — carpetas ilegibles (regresión D5-BUG-1)', () => {
  it('una subcarpeta sin permiso se salta y el resto del árbol se cataloga', () => {
    archivo('suelto.mp4');
    archivo('Terraria', 'terraria 2026.mp4');
    archivo('Bloqueada', 'no-se-ve.mp4');
    archivo('Valorant', 'valorant 2026.mp4');
    sinPermisoEn(join(outputDir, 'Bloqueada'));
    const manager = crearManager();

    let resultado: { added: number; removed: number } | undefined;
    expect(() => {
      resultado = manager.reconcile(outputDir);
    }).not.toThrow();

    expect(resultado).toEqual({ added: 3, removed: 0 });
    expect(
      manager
        .list()
        .map((c) => c.title)
        .sort(),
    ).toEqual(['suelto', 'terraria 2026', 'valorant 2026']);
  });

  it('una carpeta de clips ilegible entera no lanza ni da de baja lo que ya estaba', () => {
    const ruta = archivo('Terraria', 'terraria 2026.mp4');
    insertar(ruta, 'mi clip');
    sinPermisoEn(outputDir);
    const manager = crearManager();

    expect(manager.reconcile(outputDir)).toEqual({ added: 0, removed: 0 });
    expect(manager.list().map((c) => c.title)).toEqual(['mi clip']);
  });

  it('un archivo que desaparece (o no se deja leer) entre el listado y el stat se salta', () => {
    archivo('Terraria', 'a.mp4');
    const fugaz = archivo('Terraria', 'b.mp4');
    archivo('Terraria', 'c.mp4');
    vi.mocked(statSync).mockImplementation(((path: fs.PathLike, opts?: unknown) => {
      if (String(path) === fugaz) throw errorFs('ENOENT', 'stat', fugaz);
      return real.statSync(path, opts as never);
    }) as typeof statSync);
    const manager = crearManager();

    expect(manager.reconcile(outputDir)).toEqual({ added: 2, removed: 0 });
    expect(
      manager
        .list()
        .map((c) => c.title)
        .sort(),
    ).toEqual(['a', 'c']);
  });
});

describe('LibraryManager.reconcile — carpetas de sistema de la raíz de una unidad (regresión D5-BUG-1)', () => {
  it('no cataloga la papelera ni System Volume Information, en ninguna capitalización', () => {
    // La carpeta de clips es la raíz de una unidad (`E:\`): Windows tiene ahí sus carpetas de
    // sistema, y la papelera SÍ se deja leer (los videos borrados aparecían en la biblioteca).
    archivo('$Recycle.Bin', 'S-1-5-21-1000', '$RABC123.mp4');
    archivo('System Volume Information', 'algo.mp4');
    // Un volumen montado en una carpeta trae las suyas (aquí en mayúsculas, como en D:\).
    archivo('Montado', '$RECYCLE.BIN', 'S-1-5-21-1000', '$RDEF456.mp4');
    archivo('Montado', 'SYSTEM VOLUME INFORMATION', 'otro.png');
    archivo('Terraria', 'terraria 2026.mp4');
    const manager = crearManager();

    expect(manager.reconcile(outputDir)).toEqual({ added: 1, removed: 0 });
    expect(manager.list().map((c) => c.title)).toEqual(['terraria 2026']);
  });
});

describe('LibraryManager.reconcile — unidad no montada (regresión D5-BUG-3)', () => {
  const unidad = unidadAusente();

  it('un clip de una unidad que no está conserva su fila, sus ediciones y su miniatura', () => {
    const manager = crearManager();
    const enUsb = insertar(`${unidad}Clips\\Fortnite\\Fortnite 2026.07.01.mp4`);
    manager.updateClip(enUsb.id, { title: 'jugadón', tags: ['final'], favorite: true });
    const conThumb = manager.setClipMedia(enUsb.id, { thumbnailDataUrl: dataUrl });
    manager.setAudioEdit(enUsb.id, ['mic']);

    expect(manager.reconcile(outputDir)).toEqual({ added: 0, removed: 0 });

    const clip = manager.getClip(enUsb.id);
    expect(clip?.title).toBe('jugadón');
    expect(clip?.tags).toEqual(['final']);
    expect(clip?.favorite).toBe(true);
    expect(clip?.mutedTracks).toEqual(['mic']);
    expect(existsSync(conThumb.thumbnailPath!)).toBe(true);
  });

  it('no regresión: en una unidad que sí está, el clip cuyo archivo se borró se da de baja', () => {
    const manager = crearManager();
    const ruta = archivo('Terraria', 'borrado.mp4');
    const borrado = insertar(ruta);
    const conThumb = manager.setClipMedia(borrado.id, { thumbnailDataUrl: dataUrl });
    const enUsb = insertar(`${unidad}Clips\\otro.mp4`);
    rmSync(ruta);

    expect(manager.reconcile(outputDir)).toEqual({ added: 0, removed: 1 });
    expect(manager.getClip(borrado.id)).toBeNull();
    expect(existsSync(conThumb.thumbnailPath!)).toBe(false);
    expect(manager.getClip(enUsb.id)).not.toBeNull();
  });

  it('mira la raíz una vez por unidad y no pregunta por cada archivo de una unidad caída', () => {
    // Una unidad de red caída tarda en responder cada consulta: N clips no pueden ser N esperas.
    const manager = crearManager();
    for (let i = 0; i < 5; i++) insertar(`${unidad}Clips\\clip ${i}.mp4`);
    for (let i = 0; i < 3; i++) insertar(archivo('Terraria', `vivo ${i}.mp4`));
    vi.mocked(existsSync).mockClear();

    manager.reconcile(outputDir);

    const consultas = vi.mocked(existsSync).mock.calls.map(([p]) => String(p).toLowerCase());
    expect(consultas.filter((p) => p.startsWith(unidad.toLowerCase()))).toEqual([
      unidad.toLowerCase(),
    ]);
    const raizLocal = parse(outputDir).root.toLowerCase();
    expect(consultas.filter((p) => p === raizLocal)).toHaveLength(1);
  });
});
