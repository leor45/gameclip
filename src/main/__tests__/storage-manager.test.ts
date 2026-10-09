import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CAPTURE_SETTINGS } from '@shared/capture';
import type { ClipSource } from '@shared/library';
import { ClipsRepository } from '../library/clips-repository';
import { LibraryManager } from '../library/manager';
import { StorageManager } from '../library/storage-manager';

// Pass-through espiable: los tests de unidades ausentes cuentan a qué discos se pregunta.
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  return { ...real, existsSync: vi.fn(real.existsSync) };
});

const real = await vi.importActual<typeof import('node:fs')>('node:fs');

afterEach(() => {
  vi.mocked(existsSync).mockImplementation(real.existsSync);
});

const dir = mkdtempSync(join(tmpdir(), 'gameclip-storage-'));
const outputDir = join(dir, 'salida');
const db = new Database(':memory:');
const repo = new ClipsRepository(db);
const manager = new LibraryManager(repo, { thumbnailsDir: join(dir, 'thumbs') });

afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec('DELETE FROM clips;');
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });
});

/** Crea un archivo de `bytes` bytes y lo registra en el catálogo con la fecha dada. */
async function clip(
  nombre: string,
  bytes: number,
  opts: { source?: ClipSource; createdAt?: string; favorite?: boolean } = {},
) {
  const ruta = join(outputDir, nombre);
  writeFileSync(ruta, Buffer.alloc(bytes, 'x'));
  const registrado = (await manager.registerSavedClip(ruta, opts.source ?? 'replay'))!;
  if (opts.createdAt || opts.favorite !== undefined) {
    // createdAt no es editable por updateClip; se escribe directo en la fila para el test.
    if (opts.createdAt) {
      db.prepare('UPDATE clips SET created_at = ? WHERE id = ?').run(opts.createdAt, registrado.id);
    }
    if (opts.favorite !== undefined) {
      manager.updateClip(registrado.id, { favorite: opts.favorite });
    }
  }
  return { ...registrado, filePath: ruta };
}

function settings(overrides: Partial<typeof DEFAULT_CAPTURE_SETTINGS> = {}) {
  return { ...DEFAULT_CAPTURE_SETTINGS, ...overrides };
}

/** Dos letras de unidad que no existen en esta máquina: USB quitados. */
function unidadesAusentes(): [string, string] {
  const libres = [...'ZYXWVUTSRQPONMLKJIH']
    .map((letra) => `${letra}:\\`)
    .filter((raiz) => !real.existsSync(raiz));
  if (libres.length < 2) {
    throw new Error('Faltan letras de unidad libres para simular USB quitados.');
  }
  return [libres[0], libres[1]];
}

/** Fila de un clip en `raiz`, una unidad que no está (no hay archivo que crear). */
function filaEn(
  raiz: string,
  nombre: string,
  bytes: number,
  opts: { source?: ClipSource; createdAt?: string } = {},
) {
  return repo.insert({
    filePath: `${raiz}Clips\\${nombre}`,
    title: nombre,
    game: null,
    sizeBytes: bytes,
    createdAt: opts.createdAt ?? '2026-01-01T00:00:00.000Z',
    source: opts.source ?? 'replay',
  });
}

describe('StorageManager — getStats', () => {
  it('suma bytes por source: clipsBytes (replay+scan) vs recordingsBytes', async () => {
    await clip('replay.mp4', 100, { source: 'replay' });
    await clip('scan.mp4', 50, { source: 'scan' });
    await clip('grabacion.mp4', 200, { source: 'recording' });
    const sm = new StorageManager(manager);

    const stats = sm.getStats(outputDir);

    expect(stats.clipsBytes).toBe(150);
    expect(stats.recordingsBytes).toBe(200);
  });

  it('regresión: un clip registrado dos veces (rutas con distinto separador) no se cuenta doble', async () => {
    await clip('duplicable.mp4', 100, { source: 'replay' });
    // Segunda alta del MISMO archivo con la ruta como la escribe libobs: no debe crear otra fila.
    const rutaLibobs = `${outputDir}/duplicable.mp4`;
    await manager.registerSavedClip(rutaLibobs, 'replay');
    const sm = new StorageManager(manager);

    expect(manager.list()).toHaveLength(1);
    expect(sm.getStats(outputDir).clipsBytes).toBe(100); // antes: 200
  });

  it('las capturas van a screenshotsBytes, no a clipsBytes', async () => {
    await clip('replay.mp4', 100, { source: 'replay' });
    await clip('captura.png', 40, { source: 'scan' });
    const sm = new StorageManager(manager);

    const stats = sm.getStats(outputDir);

    expect(stats.clipsBytes).toBe(100);
    expect(stats.screenshotsBytes).toBe(40);
  });

  it('no lanza y devuelve ceros de disco con un outputDir inexistente', () => {
    const sm = new StorageManager(manager);
    const stats = sm.getStats(join(outputDir, 'no', 'existe', 'nada'));

    expect(stats.driveFreeBytes).toBeGreaterThanOrEqual(0);
    expect(stats.driveTotalBytes).toBeGreaterThanOrEqual(0);
  });

  it('informa espacio de disco real para un directorio existente', () => {
    const sm = new StorageManager(manager);
    const stats = sm.getStats(outputDir);

    expect(stats.driveTotalBytes).toBeGreaterThan(0);
    expect(stats.driveFreeBytes).toBeGreaterThan(0);
  });
});

describe('StorageManager — enforceLimit', () => {
  it('no borra nada sin límite configurado (storageLimitGb = 0)', async () => {
    await clip('a.mp4', 1000, { createdAt: '2026-01-01T00:00:00.000Z' });
    const sm = new StorageManager(manager);

    const borrados = await sm.enforceLimit(settings({ storageLimitGb: 0, autoDeleteOldest: true }));

    expect(borrados).toEqual([]);
    expect(manager.list()).toHaveLength(1);
  });

  it('no borra nada si autoDeleteOldest está desactivado', async () => {
    await clip('a.mp4', 1000, { createdAt: '2026-01-01T00:00:00.000Z' });
    const sm = new StorageManager(manager);

    const borrados = await sm.enforceLimit(
      settings({ storageLimitGb: 1, autoDeleteOldest: false }),
    );

    expect(borrados).toEqual([]);
    expect(manager.list()).toHaveLength(1);
  });

  it('borra los clips más viejos hasta quedar bajo el límite y devuelve las rutas', async () => {
    // Unidad pequeña (no GB reales) para no escribir archivos enormes en el test; el límite
    // se expresa como fracción de GB equivalente a los bytes deseados.
    const unidad = 1000;
    const viejo = await clip('viejo.mp4', unidad, { createdAt: '2026-01-01T00:00:00.000Z' });
    const medio = await clip('medio.mp4', unidad, { createdAt: '2026-01-02T00:00:00.000Z' });
    await clip('nuevo.mp4', unidad, { createdAt: '2026-01-03T00:00:00.000Z' });
    const sm = new StorageManager(manager);

    // Límite = 1 unidad: tras borrar "viejo" (2 unidades > límite) sigue sobre el límite;
    // tras borrar "medio" queda en 1 unidad = límite, se detiene.
    const borrados = await sm.enforceLimit(
      settings({ storageLimitGb: unidad / 1024 ** 3, autoDeleteOldest: true }),
    );

    expect(borrados).toEqual([viejo.filePath, medio.filePath]);
    expect(manager.list()).toHaveLength(1);
    expect(manager.list()[0].title).toBe('nuevo');
  });

  it('respeta onlyDeleteRecordings: no toca replays aunque siga sobre el límite', async () => {
    const unidad = 1000;
    await clip('replay-viejo.mp4', unidad, {
      source: 'replay',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const grabacion = await clip('grabacion.mp4', unidad, {
      source: 'recording',
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    const sm = new StorageManager(manager);

    // Límite ínfimo: nunca se satisface solo con la grabación, pero al no quedar más
    // elegibles (el replay no cuenta) el borrado se detiene ahí.
    const borrados = await sm.enforceLimit(
      settings({
        storageLimitGb: 1 / 1024 ** 3,
        autoDeleteOldest: true,
        onlyDeleteRecordings: true,
      }),
    );

    expect(borrados).toEqual([grabacion.filePath]);
    const restantes = manager.list();
    expect(restantes).toHaveLength(1);
    expect(restantes[0].source).toBe('replay');
  });

  it('nunca borra protectPath ni favoritos', async () => {
    const unidad = 1000;
    const favorito = await clip('favorito.mp4', unidad, {
      createdAt: '2026-01-01T00:00:00.000Z',
      favorite: true,
    });
    const protegido = await clip('protegido.mp4', unidad, {
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    const normal = await clip('normal.mp4', unidad, { createdAt: '2026-01-03T00:00:00.000Z' });
    const sm = new StorageManager(manager);

    const borrados = await sm.enforceLimit(
      settings({ storageLimitGb: 1 / 1024 ** 3, autoDeleteOldest: true }),
      { protectPath: protegido.filePath },
    );

    // El único elegible es "normal"; favorito y protegido sobreviven aunque siga sobre el límite.
    expect(borrados).toEqual([normal.filePath]);
    const restantes = manager.list().map((c) => c.filePath);
    expect(restantes).toEqual(expect.arrayContaining([favorito.filePath, protegido.filePath]));
  });

  it('las capturas cuentan para el límite pero nunca se borran', async () => {
    const unidad = 1000;
    // La captura es lo más viejo: sin la exclusión, sería la primera en caer.
    await clip('captura.png', unidad, { source: 'scan', createdAt: '2026-01-01T00:00:00.000Z' });
    const viejo = await clip('viejo.mp4', unidad, { createdAt: '2026-01-02T00:00:00.000Z' });
    await clip('nuevo.mp4', unidad, { createdAt: '2026-01-03T00:00:00.000Z' });
    const sm = new StorageManager(manager);

    // Límite = 2 unidades. Los 3 archivos suman 3: hay que liberar una, y solo los videos son
    // elegibles → cae el video más viejo, no la captura (que sí contaba para llegar a 3).
    const borrados = await sm.enforceLimit(
      settings({ storageLimitGb: (unidad * 2) / 1024 ** 3, autoDeleteOldest: true }),
    );

    expect(borrados).toEqual([viejo.filePath]);
    expect(manager.list().map((c) => c.title).sort()).toEqual(['captura', 'nuevo']);
  });

  it('con useRecycleBin usa trashItem inyectado y saca el registro del catálogo', async () => {
    const unidad = 1000;
    const viejo = await clip('viejo.mp4', unidad, { createdAt: '2026-01-01T00:00:00.000Z' });
    await clip('nuevo.mp4', unidad, { createdAt: '2026-01-02T00:00:00.000Z' });
    const trashItem = vi.fn().mockResolvedValue(undefined);
    const sm = new StorageManager(manager, { trashItem });

    const borrados = await sm.enforceLimit(
      settings({ storageLimitGb: unidad / 1024 ** 3, autoDeleteOldest: true, useRecycleBin: true }),
    );

    expect(trashItem).toHaveBeenCalledWith(viejo.filePath);
    expect(borrados).toEqual([viejo.filePath]);
    expect(manager.list().map((c) => c.title)).not.toContain('viejo');
  });

  it('si trashItem lanza, hace borrado duro igualmente', async () => {
    const unidad = 1000;
    const viejo = await clip('viejo.mp4', unidad, { createdAt: '2026-01-01T00:00:00.000Z' });
    await clip('nuevo.mp4', unidad, { createdAt: '2026-01-02T00:00:00.000Z' });
    const trashItem = vi.fn().mockRejectedValue(new Error('papelera no disponible'));
    const sm = new StorageManager(manager, { trashItem });

    const borrados = await sm.enforceLimit(
      settings({ storageLimitGb: unidad / 1024 ** 3, autoDeleteOldest: true, useRecycleBin: true }),
    );

    expect(trashItem).toHaveBeenCalledWith(viejo.filePath);
    expect(borrados).toEqual([viejo.filePath]);
    expect(manager.list().map((c) => c.title)).not.toContain('viejo');
  });
});

describe('StorageManager — clips de una unidad que no está (regresiones B1-1, 1.1 y 1.2)', () => {
  // Las únicas filas sin archivo que el escaneo conserva son las de la unidad de la carpeta de clips
  // sin montar (D5-BUG-3): no ocupan espacio que se pueda medir ni liberar, y «borrarlas» destruye las
  // ediciones que guardan. Las de cualquier otra unidad se cuentan como siempre, sin preguntarle nada
  // al disco: una unidad de red caída bloquearía el hilo principal.
  const [unidadSalida, otraUnidad] = unidadesAusentes();
  /** La carpeta de clips vive en el USB desenchufado. */
  const salidaEnUsb = `${unidadSalida}Clips`;
  const consultas = () =>
    vi.mocked(existsSync).mock.calls.map(([p]) => String(p).replace(/\//g, '\\').toLowerCase());

  it('getStats no cuenta los clips de la unidad de la carpeta de clips sin montar', async () => {
    await clip('real.mp4', 100, { source: 'replay' }); // carpeta anterior, en una unidad que está
    filaEn(unidadSalida, 'muerto.mp4', 500);
    filaEn(unidadSalida, 'grabacion.mp4', 300, { source: 'recording' });
    filaEn(unidadSalida, 'captura.png', 40, { source: 'scan' });

    const stats = new StorageManager(manager).getStats(salidaEnUsb);

    expect(stats.clipsBytes).toBe(100);
    expect(stats.recordingsBytes).toBe(0);
    expect(stats.screenshotsBytes).toBe(0);
  });

  it('regresión 1.2: getStats solo consulta la raíz de la carpeta de clips; lo demás cuenta como siempre', async () => {
    await clip('real.mp4', 100);
    filaEn(unidadSalida, 'muerto.mp4', 500);
    filaEn(otraUnidad, 'de-antes.mp4', 70); // otra unidad caída: cuenta, y no se le pregunta nada
    vi.mocked(existsSync).mockClear();

    const stats = new StorageManager(manager).getStats(salidaEnUsb);

    expect(stats.clipsBytes).toBe(170);
    expect(consultas().filter((p) => p === unidadSalida.toLowerCase())).toHaveLength(1);
    expect(consultas().some((p) => p.startsWith(otraUnidad.toLowerCase()))).toBe(false);
    expect(consultas().some((p) => p.endsWith('.mp4'))).toBe(false);
  });

  it('regresión 1.2: el límite deja fuera solo la unidad de la carpeta de clips sin montar', async () => {
    const unidad = 1000;
    const muerto = filaEn(unidadSalida, 'muerto.mp4', unidad, {
      createdAt: '2025-12-31T00:00:00.000Z', // el más viejo de todos
    });
    const a = await clip('a.mp4', unidad, { createdAt: '2026-01-01T00:00:00.000Z' });
    await clip('b.mp4', unidad, { createdAt: '2026-01-02T00:00:00.000Z' });
    filaEn(otraUnidad, 'de-antes.mp4', unidad, { createdAt: '2026-01-03T00:00:00.000Z' });
    vi.mocked(existsSync).mockClear();
    const sm = new StorageManager(manager);

    // Uso: a + b + de-antes = 3 (el muerto de la salida no cuenta); límite: 2 → cae `a`. Contando el
    // muerto caía él primero sin liberar nada; sin contar `de-antes`, no caía nada.
    const borrados = await sm.enforceLimit(
      settings({ storageLimitGb: (unidad * 2) / 1024 ** 3, autoDeleteOldest: true }),
      { outputDir: salidaEnUsb },
    );

    expect(borrados).toEqual([a.filePath]);
    expect(manager.getClip(muerto.id)).not.toBeNull();
    expect(consultas().filter((p) => p === unidadSalida.toLowerCase())).toHaveLength(1);
    expect(consultas().some((p) => p.startsWith(otraUnidad.toLowerCase()))).toBe(false);
  });

  it('regresión 1.1: carpeta en la raíz de un recurso de red caído, sin barra final', async () => {
    // Así la devuelve el selector de carpetas; las filas llevan la raíz con barra final.
    const recurso = '\\\\gameclip-nas-test\\clips';
    vi.mocked(existsSync).mockImplementation((p) =>
      String(p).toLowerCase().startsWith(recurso.toLowerCase()) ? false : real.existsSync(p),
    );
    const unidad = 1000;
    const muerto = repo.insert({
      filePath: `${recurso}\\Fortnite\\muerto.mp4`,
      title: 'muerto',
      game: null,
      sizeBytes: unidad,
      createdAt: '2025-12-31T00:00:00.000Z',
      source: 'replay',
    });
    await clip('a.mp4', unidad, { createdAt: '2026-01-01T00:00:00.000Z' });
    await clip('b.mp4', unidad, { createdAt: '2026-01-02T00:00:00.000Z' });

    const borrados = await new StorageManager(manager).enforceLimit(
      settings({ storageLimitGb: (unidad * 2) / 1024 ** 3, autoDeleteOldest: true }),
      { outputDir: recurso },
    );

    expect(borrados).toEqual([]);
    expect(manager.getClip(muerto.id)).not.toBeNull();
  });

  it('B1-1 de punta a punta: el escaneo da de baja las copias muertas y el límite no borra nada', async () => {
    // Copia del USB hecha con el Explorador (mismo mtime) y USB quitado: al arrancar, el escaneo corre
    // antes del primer auto-borrado y da de baja las filas del USB (no es la unidad de la salida).
    const unidad = 1000;
    for (const [i, dia] of ['01', '02', '03'].entries()) {
      const createdAt = `2026-01-${dia}T00:00:00.000Z`;
      await clip(`clip ${i}.mp4`, unidad, { createdAt });
      filaEn(otraUnidad, `clip ${i}.mp4`, unidad, { createdAt });
    }
    manager.reconcile(outputDir);

    // Uso real: 3 unidades; límite: 4.
    const borrados = await new StorageManager(manager).enforceLimit(
      settings({ storageLimitGb: (unidad * 4) / 1024 ** 3, autoDeleteOldest: true }),
      { outputDir },
    );

    expect(borrados).toEqual([]);
    expect(manager.list()).toHaveLength(3);
  });

  it('una ruta con prefijo \\\\?\\ (Node no ve su raíz) cuenta como siempre', () => {
    const ruta = join(outputDir, 'largo.mp4');
    writeFileSync(ruta, Buffer.alloc(100, 'x'));
    repo.insert({
      filePath: `\\\\?\\${ruta}`,
      title: 'largo',
      game: null,
      sizeBytes: 100,
      createdAt: '2026-01-01T00:00:00.000Z',
      source: 'replay',
    });

    expect(new StorageManager(manager).getStats(outputDir).clipsBytes).toBe(100);
  });
});
