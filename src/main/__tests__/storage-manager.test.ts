import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
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

    // El `real.mp4` cuelga de otra carpeta (la anterior): tampoco cuenta (Bug 1 de la tanda E).
    expect(stats.clipsBytes).toBe(0);
    expect(stats.recordingsBytes).toBe(0);
    expect(stats.screenshotsBytes).toBe(0);
  });

  it('regresión 1.2: getStats solo consulta la raíz de la carpeta de clips, no las demás unidades', async () => {
    await clip('real.mp4', 100);
    filaEn(unidadSalida, 'muerto.mp4', 500);
    filaEn(otraUnidad, 'de-antes.mp4', 70); // otra unidad caída: no se le pregunta nada
    vi.mocked(existsSync).mockClear();

    const stats = new StorageManager(manager).getStats(salidaEnUsb);

    expect(stats.clipsBytes).toBe(0);
    expect(consultas().filter((p) => p === unidadSalida.toLowerCase())).toHaveLength(1);
    expect(consultas().some((p) => p.startsWith(otraUnidad.toLowerCase()))).toBe(false);
    expect(consultas().some((p) => p.endsWith('.mp4'))).toBe(false);
  });

  it('regresión 1.2: el límite no borra los clips de la unidad de la carpeta de clips sin montar ni consulta otras unidades', async () => {
    const unidad = 1000;
    const muerto = filaEn(unidadSalida, 'muerto.mp4', unidad, {
      createdAt: '2025-12-31T00:00:00.000Z', // el más viejo de todos
    });
    await clip('a.mp4', unidad, { createdAt: '2026-01-01T00:00:00.000Z' });
    await clip('b.mp4', unidad, { createdAt: '2026-01-02T00:00:00.000Z' });
    filaEn(otraUnidad, 'de-antes.mp4', unidad, { createdAt: '2026-01-03T00:00:00.000Z' });
    vi.mocked(existsSync).mockClear();
    const sm = new StorageManager(manager);

    // Límite ínfimo: lo único que podría caer es el muerto de la salida (las demás filas cuelgan de
    // otra carpeta, ya no son de esta). Contándolo, caía él sin liberar nada y se destruían sus ediciones.
    const borrados = await sm.enforceLimit(
      settings({ storageLimitGb: unidad / 2 / 1024 ** 3, autoDeleteOldest: true }),
      { outputDir: salidaEnUsb },
    );

    expect(borrados).toEqual([]);
    expect(manager.getClip(muerto.id)).not.toBeNull();
    expect(manager.list()).toHaveLength(4);
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
      // Límite ínfimo: solo el muerto (dentro del recurso caído) podría caer; a y b cuelgan de otra carpeta.
      settings({ storageLimitGb: unidad / 2 / 1024 ** 3, autoDeleteOldest: true }),
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

describe('StorageManager — clips fuera de la carpeta de clips (Bug 1 de la tanda E)', () => {
  // El owner copia `E:\Clips` a la carpeta nueva y la cambia en Ajustes con el USB todavía puesto:
  // el escaneo da de alta las copias mientras las filas (y los archivos) del USB siguen vivos. Solo lo
  // que cuelga de la carpeta de clips cuenta para el límite y puede borrarse; lo demás es de otra
  // carpeta que GameClip ya no gestiona, y borrarlo era perder los originales.
  const viejaDir = join(dir, 'vieja');
  const nombres = ['uno.mp4', 'dos.mp4', 'tres.mp4'];
  const dias = ['2026-01-01', '2026-01-02', '2026-01-03'];

  /** Registra un clip real (archivo + fila) en una carpeta cualquiera. */
  function clipEn(carpeta: string, nombre: string, bytes: number, createdAt: string) {
    mkdirSync(carpeta, { recursive: true });
    const ruta = join(carpeta, nombre);
    writeFileSync(ruta, Buffer.alloc(bytes, 'x'));
    return repo.insert({
      filePath: ruta,
      title: nombre,
      game: null,
      sizeBytes: bytes,
      createdAt: `${createdAt}T00:00:00.000Z`,
      source: 'replay',
    });
  }

  /** Originales en la carpeta vieja y copias en la de clips, con las mismas fechas (el Explorador conserva el mtime). */
  function copiasYOriginales(bytes: number) {
    const originales = nombres.map((n, i) => clipEn(viejaDir, n, bytes, dias[i]));
    const copias = nombres.map((n, i) => clipEn(outputDir, n, bytes, dias[i]));
    return { originales, copias };
  }

  beforeEach(() => {
    rmSync(viejaDir, { recursive: true, force: true });
  });

  it('el escenario del bug: límite entre una copia y la suma → no se borra nada y los originales siguen en disco', async () => {
    const unidad = 1000;
    const { originales, copias } = copiasYOriginales(unidad);
    const sm = new StorageManager(manager);

    // Uso real de la carpeta de clips: 3 unidades. Límite: 4. Contando también los originales eran 6
    // y caían, de los más viejos a los más nuevos, copias Y originales.
    const borrados = await sm.enforceLimit(
      settings({ storageLimitGb: (unidad * 4) / 1024 ** 3, autoDeleteOldest: true }),
      { outputDir },
    );

    expect(borrados).toEqual([]);
    expect(manager.list()).toHaveLength(6);
    for (const original of originales) expect(real.existsSync(original.filePath)).toBe(true);
    for (const copia of copias) expect(real.existsSync(copia.filePath)).toBe(true);
  });

  it('de punta a punta: el guardado de Ajustes (escaneo + límite) tras copiar la carpeta no pierde nada', async () => {
    const unidad = 1000;
    // Solo los originales están catalogados; las copias las da de alta el escaneo del guardado.
    const originales = nombres.map((n, i) => clipEn(viejaDir, n, unidad, dias[i]));
    for (const n of nombres) real.copyFileSync(join(viejaDir, n), join(outputDir, n));
    const sm = new StorageManager(manager);

    expect(manager.reconcile(outputDir)).toEqual({ added: 3, removed: 0 });
    const borrados = await sm.enforceLimit(
      settings({ storageLimitGb: (unidad * 4) / 1024 ** 3, autoDeleteOldest: true }),
      { outputDir },
    );

    expect(borrados).toEqual([]);
    expect(manager.list()).toHaveLength(6);
    for (const original of originales) expect(real.existsSync(original.filePath)).toBe(true);
  });

  it('sigue borrando los más viejos de DENTRO cuando de verdad se supera el límite, y no toca los de fuera', async () => {
    const unidad = 1000;
    const { originales, copias } = copiasYOriginales(unidad);
    const sm = new StorageManager(manager);

    // Límite: 2 unidades; dentro hay 3 → cae la copia más vieja. Los originales (con la misma fecha
    // que ella) no son elegibles.
    const borrados = await sm.enforceLimit(
      settings({ storageLimitGb: (unidad * 2) / 1024 ** 3, autoDeleteOldest: true }),
      { outputDir },
    );

    expect(borrados).toEqual([copias[0].filePath]);
    expect(real.existsSync(copias[0].filePath)).toBe(false);
    for (const original of originales) {
      expect(real.existsSync(original.filePath)).toBe(true);
      expect(manager.getClip(original.id)).not.toBeNull();
    }
    expect(manager.list()).toHaveLength(5);
  });

  it('la carpeta de clips escrita con otra capitalización, con / o con barra final sigue siendo la misma', async () => {
    const unidad = 1000;
    copiasYOriginales(unidad);
    const sm = new StorageManager(manager);
    const limite = settings({ storageLimitGb: (unidad * 4) / 1024 ** 3, autoDeleteOldest: true });

    for (const variante of [
      outputDir.toUpperCase(),
      outputDir.replace(/\\/g, '/'),
      `${outputDir}\\`,
    ]) {
      expect(await sm.enforceLimit(limite, { outputDir: variante })).toEqual([]);
      expect(sm.getStats(variante).clipsBytes).toBe(unidad * 3);
    }
    expect(manager.list()).toHaveLength(6);
  });

  it('sin outputDir se comporta como siempre: todo el catálogo cuenta', async () => {
    const unidad = 1000;
    const { originales } = copiasYOriginales(unidad);
    const sm = new StorageManager(manager);

    const borrados = await sm.enforceLimit(
      settings({ storageLimitGb: (unidad * 4) / 1024 ** 3, autoDeleteOldest: true }),
    );

    // 6 unidades contra límite 4: caen 2, y entre ellos están los originales (más viejos o empatados).
    expect(borrados).toHaveLength(2);
    expect(originales.some((o) => !real.existsSync(o.filePath))).toBe(true);
  });

  it('getStats mide lo mismo que el límite: lo de fuera de la carpeta no cuenta', () => {
    const unidad = 1000;
    copiasYOriginales(unidad);
    clipEn(viejaDir, 'grabacion.mp4', 500, '2026-01-04');
    db.prepare("UPDATE clips SET source = 'recording' WHERE title = 'grabacion.mp4'").run();
    clipEn(viejaDir, 'captura.png', 40, '2026-01-04');
    const sm = new StorageManager(manager);

    const stats = sm.getStats(outputDir);

    expect(stats.clipsBytes).toBe(unidad * 3);
    expect(stats.recordingsBytes).toBe(0);
    expect(stats.screenshotsBytes).toBe(0);
    // Y apuntando la carpeta de clips a la vieja, cuentan sus filas y no las otras.
    const vieja = sm.getStats(viejaDir);
    expect(vieja.clipsBytes).toBe(unidad * 3);
    expect(vieja.recordingsBytes).toBe(500);
    expect(vieja.screenshotsBytes).toBe(40);
  });

  it('una carpeta hermana con el mismo prefijo en el nombre no cuenta como la carpeta de clips', async () => {
    const hermana = `${outputDir} copia`;
    try {
      clipEn(hermana, 'hermano.mp4', 700, '2026-01-01');
      await clip('propio.mp4', 100);

      expect(new StorageManager(manager).getStats(outputDir).clipsBytes).toBe(100);
    } finally {
      rmSync(hermana, { recursive: true, force: true });
    }
  });

  it('la carpeta de clips es la raíz de una unidad: cuelga todo lo de esa unidad', () => {
    const raiz = parse(outputDir).root; // p. ej. C:\
    repo.insert({
      filePath: join(outputDir, 'x.mp4'),
      title: 'x',
      game: null,
      sizeBytes: 123,
      createdAt: '2026-01-01T00:00:00.000Z',
      source: 'replay',
    });

    expect(new StorageManager(manager).getStats(raiz).clipsBytes).toBe(123);
    expect(new StorageManager(manager).getStats(raiz.toLowerCase()).clipsBytes).toBe(123);
  });

  it('combinado con la unidad sin montar: lo de la unidad ausente y lo de otras carpetas, fuera', async () => {
    const [unidadSalida] = unidadesAusentes();
    const salidaEnUsb = `${unidadSalida}Clips`;
    const unidad = 1000;
    const muerto = filaEn(unidadSalida, 'muerto.mp4', unidad, {
      createdAt: '2025-12-31T00:00:00.000Z',
    });
    const { originales } = copiasYOriginales(unidad);
    const sm = new StorageManager(manager);

    const borrados = await sm.enforceLimit(
      settings({ storageLimitGb: unidad / 2 / 1024 ** 3, autoDeleteOldest: true }),
      { outputDir: salidaEnUsb },
    );

    expect(borrados).toEqual([]);
    expect(manager.getClip(muerto.id)).not.toBeNull();
    for (const original of originales) expect(real.existsSync(original.filePath)).toBe(true);
    expect(manager.list()).toHaveLength(7);
  });
});
