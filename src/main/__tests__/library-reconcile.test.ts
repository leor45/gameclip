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
import { createVolumeAccessCheck, volumeRootKey } from '../library/clip-path';
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
  /** La carpeta de clips vive en el USB desenchufado (o en la unidad de red aún sin conectar). */
  const salidaEnUsb = `${unidad}Clips`;

  it('si no está la unidad de la carpeta de clips, sus clips conservan fila, ediciones y miniatura', () => {
    const manager = crearManager();
    const enUsb = insertar(`${salidaEnUsb}\\Fortnite\\Fortnite 2026.07.01.mp4`);
    manager.updateClip(enUsb.id, { title: 'jugadón', tags: ['final'], favorite: true });
    const conThumb = manager.setClipMedia(enUsb.id, { thumbnailDataUrl: dataUrl });
    manager.setAudioEdit(enUsb.id, ['mic']);

    expect(manager.reconcile(salidaEnUsb)).toEqual({ added: 0, removed: 0 });

    const clip = manager.getClip(enUsb.id);
    expect(clip?.title).toBe('jugadón');
    expect(clip?.tags).toEqual(['final']);
    expect(clip?.favorite).toBe(true);
    expect(clip?.mutedTracks).toEqual(['mic']);
    expect(existsSync(conThumb.thumbnailPath!)).toBe(true);
  });

  it('no regresión: en la misma pasada, el clip borrado de una unidad que sí está se da de baja', () => {
    const manager = crearManager();
    const ruta = archivo('Terraria', 'borrado.mp4'); // carpeta de salida anterior, en una unidad que está
    const borrado = insertar(ruta);
    const conThumb = manager.setClipMedia(borrado.id, { thumbnailDataUrl: dataUrl });
    const enUsb = insertar(`${salidaEnUsb}\\otro.mp4`);
    rmSync(ruta);

    expect(manager.reconcile(salidaEnUsb)).toEqual({ added: 0, removed: 1 });
    expect(manager.getClip(borrado.id)).toBeNull();
    expect(existsSync(conThumb.thumbnailPath!)).toBe(false);
    expect(manager.getClip(enUsb.id)).not.toBeNull();
  });

  it('mira la raíz de la unidad caída una vez y no pregunta por cada uno de sus archivos', () => {
    // Una unidad de red caída tarda en responder cada consulta: N clips no pueden ser N esperas.
    const manager = crearManager();
    for (let i = 0; i < 5; i++) insertar(`${salidaEnUsb}\\clip ${i}.mp4`);
    for (let i = 0; i < 3; i++) insertar(archivo('Terraria', `vivo ${i}.mp4`));
    vi.mocked(existsSync).mockClear();

    manager.reconcile(salidaEnUsb);

    const consultas = vi.mocked(existsSync).mock.calls.map(([p]) => String(p).toLowerCase());
    const enLaUnidad = consultas.filter((p) => p.startsWith(unidad.toLowerCase()));
    expect(enLaUnidad.filter((p) => p === unidad.toLowerCase())).toHaveLength(1);
    expect(enLaUnidad.filter((p) => p.endsWith('.mp4'))).toEqual([]);
  });
});

describe('LibraryManager.reconcile — clips de otra unidad que ya no está (regresión B1-1)', () => {
  const unidad = unidadAusente();

  it('copió la carpeta del USB a otra unidad y quitó el USB: sus filas se van y no hay duplicados', () => {
    // Grabado en el USB (E:\Clips); el owner copia la carpeta con el Explorador a la carpeta nueva,
    // quita el USB para siempre y apunta GameClip a la copia.
    const nombres = [
      'Fortnite 2026.07.01 - 10.00.00.00.mp4',
      'Fortnite 2026.07.02 - 10.00.00.00.mp4',
    ];
    const muertos = nombres.map((n) => insertar(`${unidad}Clips\\Fortnite\\${n}`));
    for (const n of nombres) archivo('Fortnite', n);
    const manager = crearManager();

    expect(manager.reconcile(outputDir)).toEqual({ added: 2, removed: 2 });

    for (const muerto of muertos) expect(manager.getClip(muerto.id)).toBeNull();
    const rutas = manager.list().map((c) => c.filePath);
    expect(rutas).toHaveLength(2);
    expect(rutas.every((p) => p.startsWith(outputDir))).toBe(true);
  });

  it('la unidad de la carpeta de clips se compara sin mayúsculas ni tipo de barra', () => {
    const manager = crearManager();
    const enUsb = insertar(`${unidad}Clips\\clip.mp4`);

    // La carpeta de salida escrita con otra capitalización y con `/` sigue siendo la misma unidad.
    expect(manager.reconcile(`${unidad.toLowerCase().replace('\\', '/')}Clips`)).toEqual({
      added: 0,
      removed: 0,
    });
    expect(manager.getClip(enUsb.id)).not.toBeNull();
  });

  it('una ruta con prefijo \\\\?\\ se juzga por su archivo, como antes (Node no ve su raíz)', () => {
    const fuera = join(dir, 'otra-carpeta');
    mkdirSync(fuera, { recursive: true });
    const vivo = join(fuera, 'largo.mp4');
    const borrado = join(fuera, 'largo-borrado.mp4');
    writeFileSync(vivo, 'video');
    const conVivo = insertar(`\\\\?\\${vivo}`);
    const conBorrado = insertar(`\\\\?\\${borrado}`);
    const manager = crearManager();

    expect(manager.reconcile(outputDir)).toEqual({ added: 0, removed: 1 });
    expect(manager.getClip(conVivo.id)).not.toBeNull();
    expect(manager.getClip(conBorrado.id)).toBeNull();
    rmSync(fuera, { recursive: true, force: true });
  });
});

describe('LibraryManager.reconcile — carpeta de clips en la raíz de un recurso de red (regresión 1.1)', () => {
  // Servidor inventado: `existsSync` contesta «no está» sin salir a la red.
  const recurso = '\\\\gameclip-nas-test\\clips';
  function recursoCaido(): void {
    vi.mocked(existsSync).mockImplementation((p) =>
      String(p).replace(/\//g, '\\').toLowerCase().startsWith(recurso.toLowerCase())
        ? false
        : real.existsSync(p),
    );
  }

  it.each([
    ['tal como la da el selector, sin barra final', recurso],
    ['con barras normales', '//gameclip-nas-test/clips'],
    ['con barra final', `${recurso}\\`],
  ])('con el recurso caído, sus clips se conservan (carpeta %s)', (_, salida) => {
    recursoCaido();
    const enRecurso = insertar(`${recurso}\\Fortnite\\Fortnite 2026.07.01.mp4`);
    const manager = crearManager();

    expect(manager.reconcile(salida)).toEqual({ added: 0, removed: 0 });
    expect(manager.getClip(enRecurso.id)).not.toBeNull();
  });
});

describe('volumeRootKey', () => {
  it('la misma unidad da la misma clave con o sin barra final, con cualquier barra y capitalización', () => {
    for (const p of [
      '\\\\nas\\clips',
      '\\\\nas\\clips\\',
      '//nas/clips',
      '//NAS/Clips/',
      '\\\\NAS\\Clips\\sub\\a.mp4',
    ]) {
      expect(volumeRootKey(p)).toBe('\\\\nas\\clips\\');
    }
    for (const p of ['D:', 'd:/', 'D:\\Clips\\a.mp4']) expect(volumeRootKey(p)).toBe('d:\\');
    expect(volumeRootKey('relativo\\a.mp4')).toBe('');
  });
});

describe('createVolumeAccessCheck', () => {
  const unidad = unidadAusente();

  it('false solo para la raíz de una unidad que no está; cada unidad se consulta una vez', () => {
    const accesible = createVolumeAccessCheck();
    const raizLocal = parse(dir).root;
    vi.mocked(existsSync).mockClear();

    expect(accesible(`${unidad}Clips\\a.mp4`)).toBe(false);
    expect(accesible(`${unidad.toLowerCase()}otra\\b.mp4`)).toBe(false);
    expect(accesible(join(dir, 'c.mp4'))).toBe(true);
    expect(accesible(`${raizLocal.replace('\\', '/')}d.mp4`)).toBe(true);

    expect(vi.mocked(existsSync)).toHaveBeenCalledTimes(2);
  });

  it('lo que no puede comprobar (prefijo \\\\?\\ o \\\\.\\, sin raíz) lo da por accesible', () => {
    // Node no ve `\\?\D:\` aunque la unidad esté (existsSync → false): tratarla como ausente
    // sacaría esos clips del límite y del uso para siempre. Se tratan como antes del fix.
    const accesible = createVolumeAccessCheck();

    expect(accesible(`\\\\?\\${unidad}Clips\\a.mp4`)).toBe(true);
    expect(accesible('\\\\.\\C:\\a.mp4')).toBe(true);
    expect(accesible('relativo\\a.mp4')).toBe(true);
  });
});

describe('LibraryManager.reconcile — la misma carpeta por dos caminos (Bug 6 de la tanda E)', () => {
  // Una unidad de red vista como `Z:\Clips` y como `\\nas\recurso\Clips`, una carpeta tras un junction
  // o un volumen montado en carpeta: si la carpeta de clips pasa de una forma a la otra, las filas de la
  // forma vieja siguen vivas (su archivo existe) y el escaneo daba de alta los mismos archivos por la
  // forma nueva. Los junctions de aquí son reales (no piden administrador en Windows).
  const enlace = join(dir, 'enlace');
  const otroEnlace = join(dir, 'otro-enlace');
  const viejaDir = join(dir, 'vieja');
  const bigint = () =>
    vi.mocked(statSync).mock.calls.filter(([, opts]) => (opts as { bigint?: boolean })?.bigint);

  function enlazar(ruta: string, destino = outputDir): string {
    real.symlinkSync(destino, ruta, 'junction');
    return ruta;
  }

  beforeEach(() => {
    rmSync(viejaDir, { recursive: true, force: true });
    for (const e of [enlace, otroEnlace]) {
      if (real.existsSync(e)) real.rmdirSync(e); // quita solo el junction, no su destino
    }
  });

  afterEach(() => {
    for (const e of [enlace, otroEnlace]) {
      if (real.existsSync(e)) real.rmdirSync(e);
    }
  });

  /** Fila con todo lo que el usuario pudo haberle puesto: título, favorito, etiquetas, miniatura, pistas. */
  function clipEditado(manager: LibraryManager, ruta: string) {
    const fila = insertar(ruta, 'mi jugada');
    manager.updateClip(fila.id, { favorite: true, tags: ['final', 'clutch'] });
    manager.setClipMedia(fila.id, { durationSeconds: 12.5, thumbnailDataUrl: dataUrl });
    manager.setAudioEdit(fila.id, ['mic']);
    return fila;
  }

  it('catalogado por la ruta real y la carpeta pasa al junction: se re-apunta la fila, no se duplica', () => {
    const ruta = archivo('Fortnite', 'a.mp4');
    const manager = crearManager();
    const fila = clipEditado(manager, ruta);
    enlazar(enlace);
    const cambios = vi.fn();
    manager.on('changed', cambios);

    expect(manager.reconcile(enlace)).toEqual({ added: 0, removed: 0 });

    const clips = manager.list();
    expect(clips).toHaveLength(1);
    const clip = clips[0];
    expect(clip.id).toBe(fila.id); // las URLs de medios y la miniatura siguen valiendo
    expect(clip.filePath).toBe(join(enlace, 'Fortnite', 'a.mp4'));
    expect(clip.title).toBe('mi jugada');
    expect(clip.favorite).toBe(true);
    expect(clip.tags.sort()).toEqual(['clutch', 'final']);
    expect(clip.durationSeconds).toBe(12.5);
    expect(clip.mutedTracks).toEqual(['mic']);
    expect(existsSync(clip.thumbnailPath!)).toBe(true);
    expect(cambios).toHaveBeenCalledTimes(1); // re-apuntar cambia la biblioteca: el renderer se entera
  });

  it('el camino inverso (catalogado por el junction, la carpeta pasa a la ruta real) también', () => {
    archivo('Fortnite', 'a.mp4');
    enlazar(enlace);
    const manager = crearManager();
    const fila = clipEditado(manager, join(enlace, 'Fortnite', 'a.mp4'));

    expect(manager.reconcile(outputDir)).toEqual({ added: 0, removed: 0 });

    expect(manager.list()).toHaveLength(1);
    expect(manager.getClip(fila.id)?.filePath).toBe(join(outputDir, 'Fortnite', 'a.mp4'));
    expect(manager.getClip(fila.id)?.favorite).toBe(true);
  });

  it('tras re-apuntar, el re-etiquetado (que corre después en el guardado) deja el juego de la carpeta', () => {
    const ruta = archivo('Fortnite', 'a.mp4');
    const manager = crearManager();
    const fila = repo.insert({
      filePath: ruta,
      title: 'a',
      game: null,
      sizeBytes: 1,
      createdAt: '2026-07-01T10:00:00.000Z',
      source: 'replay',
    });
    enlazar(enlace);

    manager.reconcile(enlace);
    manager.relabelGames(enlace);

    expect(manager.getClip(fila.id)?.game).toBe('Fortnite');
  });

  it('un duplicado que ya dejó la v0.9.7 (las dos filas) se fusiona en una: la más antigua, con la ruta de dentro', () => {
    const ruta = archivo('Fortnite', 'a.mp4');
    const manager = crearManager();
    const antigua = clipEditado(manager, ruta);
    enlazar(enlace);
    const duplicada = repo.insert({
      filePath: join(enlace, 'Fortnite', 'a.mp4'),
      title: 'a',
      game: 'Otro',
      sizeBytes: 18,
      createdAt: '2026-07-02T10:00:00.000Z',
      source: 'scan',
    });
    manager.updateClip(duplicada.id, { tags: ['ace'] });
    const miniaturaDuplicada = manager.setClipMedia(duplicada.id, {
      thumbnailDataUrl: dataUrl,
    }).thumbnailPath!;

    expect(manager.reconcile(enlace)).toEqual({ added: 0, removed: 1 });

    const clips = manager.list();
    expect(clips).toHaveLength(1);
    const clip = clips[0];
    expect(clip.id).toBe(antigua.id); // el menor id: el que creó la captura
    expect(clip.filePath).toBe(join(enlace, 'Fortnite', 'a.mp4'));
    expect(clip.title).toBe('mi jugada');
    expect(clip.favorite).toBe(true);
    expect(clip.tags.sort()).toEqual(['ace', 'clutch', 'final']); // etiquetas unidas
    expect(clip.durationSeconds).toBe(12.5);
    expect(existsSync(clip.thumbnailPath!)).toBe(true);
    expect(existsSync(miniaturaDuplicada)).toBe(false); // la miniatura que sobra se borra
    expect(manager.getClip(duplicada.id)).toBeNull();
  });

  it('el duplicado cuya fila más antigua es la de dentro: conserva su ruta y suma lo de la de fuera', () => {
    const ruta = archivo('Fortnite', 'a.mp4');
    enlazar(enlace);
    const manager = crearManager();
    const dentro = insertar(join(enlace, 'Fortnite', 'a.mp4'), 'a'); // id menor: la de dentro
    const fuera = clipEditado(manager, ruta);

    expect(manager.reconcile(enlace)).toEqual({ added: 0, removed: 1 });

    const clips = manager.list();
    expect(clips).toHaveLength(1);
    expect(clips[0].id).toBe(dentro.id);
    expect(clips[0].filePath).toBe(join(enlace, 'Fortnite', 'a.mp4'));
    expect(clips[0].favorite).toBe(true); // venía de la fila de fuera
    expect(clips[0].tags.sort()).toEqual(['clutch', 'final']);
    expect(manager.getClip(fuera.id)).toBeNull();
  });

  it('tres caminos al mismo archivo: una sola fila, y se cuenta cada descartada', () => {
    const ruta = archivo('Fortnite', 'a.mp4');
    enlazar(enlace);
    enlazar(otroEnlace);
    const manager = crearManager();
    const primera = insertar(ruta, 'primera');
    insertar(join(enlace, 'Fortnite', 'a.mp4'), 'segunda');

    expect(manager.reconcile(otroEnlace)).toEqual({ added: 0, removed: 1 });

    expect(manager.list().map((c) => [c.id, c.filePath])).toEqual([
      [primera.id, join(otroEnlace, 'Fortnite', 'a.mp4')],
    ]);
  });

  it('dos archivos DISTINTOS con el mismo nombre y tamaño (las copias del Bug 1) siguen siendo dos filas', () => {
    const original = join(viejaDir, 'Fortnite', 'a.mp4');
    mkdirSync(join(viejaDir, 'Fortnite'), { recursive: true });
    writeFileSync(original, 'contenido-de-video');
    const manager = crearManager();
    const filaVieja = insertar(original, 'original');
    real.mkdirSync(join(outputDir, 'Fortnite'), { recursive: true });
    real.copyFileSync(original, join(outputDir, 'Fortnite', 'a.mp4')); // misma ruta relativa, nombre y tamaño

    expect(manager.reconcile(outputDir)).toEqual({ added: 1, removed: 0 });

    expect(manager.list()).toHaveLength(2);
    expect(manager.getClip(filaVieja.id)?.filePath).toBe(original); // sigue apuntando a su archivo
    expect(real.existsSync(original)).toBe(true);
  });

  it('un hard link es el mismo archivo físico: se trata como el mismo clip', () => {
    const original = join(viejaDir, 'Fortnite', 'a.mp4');
    mkdirSync(join(viejaDir, 'Fortnite'), { recursive: true });
    writeFileSync(original, 'contenido-de-video');
    const manager = crearManager();
    const filaVieja = insertar(original, 'original');
    mkdirSync(join(outputDir, 'Fortnite'), { recursive: true });
    real.linkSync(original, join(outputDir, 'Fortnite', 'a.mp4'));

    expect(manager.reconcile(outputDir)).toEqual({ added: 0, removed: 0 });

    expect(manager.list().map((c) => c.id)).toEqual([filaVieja.id]);
    expect(manager.getClip(filaVieja.id)?.filePath).toBe(join(outputDir, 'Fortnite', 'a.mp4'));
  });

  it('una fila de fuera que no coincide con nada de dentro se queda como estaba (carpeta anterior legítima)', () => {
    const original = join(viejaDir, 'Fortnite', 'a.mp4');
    mkdirSync(join(viejaDir, 'Fortnite'), { recursive: true });
    writeFileSync(original, 'contenido-de-video');
    const manager = crearManager();
    const filaVieja = clipEditado(manager, original);
    archivo('Terraria', 'otro.mp4');

    expect(manager.reconcile(outputDir)).toEqual({ added: 1, removed: 0 });

    expect(manager.getClip(filaVieja.id)?.filePath).toBe(original);
    expect(manager.getClip(filaVieja.id)?.favorite).toBe(true);
  });

  it('sin filas de fuera no se pregunta por la identidad de nada', () => {
    archivo('Fortnite', 'a.mp4');
    archivo('Terraria', 'b.mp4');
    insertar(archivo('Valorant', 'c.mp4'));
    vi.mocked(statSync).mockClear();
    const manager = crearManager();

    expect(manager.reconcile(outputDir)).toEqual({ added: 2, removed: 0 });

    expect(bigint()).toEqual([]);
  });

  it('una carpeta anterior de clips distintos (nombres que no coinciden) no cuesta ningún stat', () => {
    // El caso más común: el owner cambió de carpeta sin copiar nada y la vieja sigue ahí con lo suyo.
    mkdirSync(viejaDir, { recursive: true });
    const manager = crearManager();
    for (const n of ['x.mp4', 'y.mp4']) {
      writeFileSync(join(viejaDir, n), 'v'.repeat(500));
      insertar(join(viejaDir, n));
    }
    for (const n of ['a.mp4', 'b.mp4', 'c.mp4']) insertar(archivo(n));
    archivo('nuevo.mp4');
    vi.mocked(statSync).mockClear();

    expect(manager.reconcile(outputDir)).toEqual({ added: 1, removed: 0 });

    expect(bigint()).toEqual([]);
  });

  it('con nombres que coinciden solo se mira la identidad de esas filas de fuera y de esos archivos', () => {
    mkdirSync(viejaDir, { recursive: true });
    const manager = crearManager();
    for (const n of ['x.mp4', 'y.mp4', 'w.mp4']) {
      writeFileSync(join(viejaDir, n), 'v'.repeat(500));
      insertar(join(viejaDir, n));
    }
    archivo('x.mp4'); // sin fila, se llama como una de fuera (otro archivo: copia)
    insertar(archivo('y.mp4')); // con fila, se llama como otra de fuera (otro archivo)
    for (const n of ['a.mp4', 'b.mp4']) insertar(archivo(n)); // sin pareja por nombre
    archivo('NUEVO.mp4');
    vi.mocked(statSync).mockClear();

    expect(manager.reconcile(outputDir)).toEqual({ added: 2, removed: 0 });

    // Filas de fuera x e y (w no tiene pareja por nombre) + los archivos de dentro x e y: 4 consultas.
    const consultados = bigint()
      .map(([p]) => String(p).toLowerCase())
      .sort();
    expect(consultados).toEqual(
      [
        join(viejaDir, 'x.mp4'),
        join(viejaDir, 'y.mp4'),
        join(outputDir, 'x.mp4'),
        join(outputDir, 'y.mp4'),
      ]
        .map((p) => p.toLowerCase())
        .sort(),
    );
    expect(manager.list()).toHaveLength(8); // son copias: ninguna se fusiona
  });

  it('el nombre se compara sin distinguir mayúsculas', () => {
    mkdirSync(join(viejaDir, 'Fortnite'), { recursive: true });
    const original = join(viejaDir, 'Fortnite', 'CLIP.MP4');
    writeFileSync(original, 'contenido-de-video');
    const fila = insertar(original, 'original');
    mkdirSync(join(outputDir, 'Fortnite'), { recursive: true });
    real.linkSync(original, join(outputDir, 'Fortnite', 'clip.mp4'));
    const manager = crearManager();

    expect(manager.reconcile(outputDir)).toEqual({ added: 0, removed: 0 });

    expect(manager.list().map((c) => c.id)).toEqual([fila.id]);
  });

  it('límite conocido: un hard link con OTRO nombre no se reconoce y queda como clip aparte', () => {
    // El prefiltro por nombre no toca el disco; las tres formas del bug (Z:/UNC, junction, volumen
    // montado en carpeta) conservan el nombre. Un hard link renombrado es exótico y queda fuera.
    const original = join(viejaDir, 'Fortnite', 'a.mp4');
    mkdirSync(join(viejaDir, 'Fortnite'), { recursive: true });
    writeFileSync(original, 'contenido-de-video');
    insertar(original, 'original');
    mkdirSync(join(outputDir, 'Fortnite'), { recursive: true });
    real.linkSync(original, join(outputDir, 'Fortnite', 'otro-nombre.mp4'));
    const manager = crearManager();
    vi.mocked(statSync).mockClear();

    expect(manager.reconcile(outputDir)).toEqual({ added: 1, removed: 0 });

    expect(manager.list()).toHaveLength(2);
    expect(bigint()).toEqual([]);
  });

  it('si la identidad de una fila de fuera no se puede leer, esa fila no se fusiona y el escaneo sigue', () => {
    const original = join(viejaDir, 'Fortnite', 'a.mp4');
    mkdirSync(join(viejaDir, 'Fortnite'), { recursive: true });
    writeFileSync(original, 'contenido-de-video');
    real.mkdirSync(join(outputDir, 'Fortnite'), { recursive: true });
    real.linkSync(original, join(outputDir, 'Fortnite', 'a.mp4')); // sería el mismo archivo
    archivo('Terraria', 'b.mp4');
    vi.mocked(statSync).mockImplementation(((path: fs.PathLike, opts?: unknown) => {
      if (String(path) === original && (opts as { bigint?: boolean })?.bigint) {
        throw errorFs('EPERM', 'stat', original);
      }
      return real.statSync(path, opts as never);
    }) as typeof statSync);
    const manager = crearManager();
    insertar(original, 'original');

    let resultado: { added: number; removed: number } | undefined;
    expect(() => {
      resultado = manager.reconcile(outputDir);
    }).not.toThrow();

    expect(resultado).toEqual({ added: 2, removed: 0 }); // el hard link se da de alta como siempre
    expect(manager.list()).toHaveLength(3);
  });

  it('un servidor que no da identificador de archivo (ino 0) no identifica: no se fusiona', () => {
    const original = join(viejaDir, 'Fortnite', 'a.mp4');
    mkdirSync(join(viejaDir, 'Fortnite'), { recursive: true });
    writeFileSync(original, 'contenido-de-video');
    real.mkdirSync(join(outputDir, 'Fortnite'), { recursive: true });
    real.linkSync(original, join(outputDir, 'Fortnite', 'a.mp4'));
    vi.mocked(statSync).mockImplementation(((path: fs.PathLike, opts?: unknown) => {
      const st = real.statSync(path, opts as never);
      return (opts as { bigint?: boolean })?.bigint ? { ...st, ino: 0n } : st;
    }) as typeof statSync);
    const manager = crearManager();
    insertar(original, 'original');

    expect(manager.reconcile(outputDir)).toEqual({ added: 1, removed: 0 });
    expect(manager.list()).toHaveLength(2);
  });

  it('un archivo vacío no tiene identidad fiable (en FAT/exFAT no ocupa clúster): no se fusiona', () => {
    const original = join(viejaDir, 'a.mp4');
    mkdirSync(viejaDir, { recursive: true });
    writeFileSync(original, '');
    real.linkSync(original, join(outputDir, 'a.mp4'));
    const manager = crearManager();
    insertar(original, 'original');

    expect(manager.reconcile(outputDir)).toEqual({ added: 1, removed: 0 });
    expect(manager.list()).toHaveLength(2);
  });

  it('una fila de fuera con la unidad de la salida sin montar no se consulta (no hay identidad que pedir)', () => {
    const unidad = unidadAusente();
    const manager = crearManager();
    insertar(`${unidad}Clips\\Fortnite\\a.mp4`);
    vi.mocked(statSync).mockClear();

    expect(manager.reconcile(`${unidad}Clips`)).toEqual({ added: 0, removed: 0 });

    expect(bigint()).toEqual([]);
  });

  it('un fallo al fusionar no aborta el escaneo: lo demás se cataloga', () => {
    const ruta = archivo('Fortnite', 'a.mp4');
    enlazar(enlace);
    const manager = crearManager();
    insertar(ruta);
    archivo('Terraria', 'b.mp4');
    const rota = vi.spyOn(repo, 'setPath').mockImplementation(() => {
      throw new Error('disco de la DB lleno');
    });
    const errores = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      expect(() => manager.reconcile(enlace)).not.toThrow();
    } finally {
      rota.mockRestore();
      errores.mockRestore();
    }

    expect(manager.list().map((c) => c.title).sort()).toEqual(['b', 'clip']);
  });

  describe('lo que depende del archivo se unifica al fusionar', () => {
    /** Mismo archivo por dos caminos: la fila de fuera es la más antigua (menor id), la de dentro la duplicada. */
    function duplicado(
      manager: LibraryManager,
      antigua: Partial<ClipFixture>,
      nueva: Partial<ClipFixture>,
    ) {
      const ruta = archivo('Fortnite', 'a.mp4');
      enlazar(enlace);
      const filaAntigua = insertar(ruta, antigua.title ?? 'a');
      manager.updateClip(filaAntigua.id, { favorite: antigua.favorite ?? false });
      if (antigua.mutedTracks) manager.setAudioEdit(filaAntigua.id, antigua.mutedTracks);
      const filaNueva = insertar(join(enlace, 'Fortnite', 'a.mp4'), nueva.title ?? 'a');
      if (nueva.mutedTracks) manager.setAudioEdit(filaNueva.id, nueva.mutedTracks);
      return { filaAntigua, filaNueva };
    }

    it('el tamaño de la fila conservada es el real del archivo (el de la DB estaba desfasado)', () => {
      const manager = crearManager();
      const { filaAntigua } = duplicado(manager, {}, {});
      db.prepare('UPDATE clips SET size_bytes = 1234').run(); // desfasado: el archivo pesa 18

      manager.reconcile(enlace);

      expect(manager.getClip(filaAntigua.id)?.sizeBytes).toBe(18);
    });

    it('el título personalizado de la fila descartada gana al derivado del nombre del archivo', () => {
      const manager = crearManager();
      const { filaAntigua } = duplicado(manager, { title: 'a' }, { title: 'jugadón' });

      expect(manager.reconcile(enlace)).toEqual({ added: 0, removed: 1 });

      expect(manager.getClip(filaAntigua.id)?.title).toBe('jugadón');
    });

    it('si los dos títulos son personalizados gana el de la conservada', () => {
      const manager = crearManager();
      const { filaAntigua } = duplicado(manager, { title: 'mi jugada' }, { title: 'jugadón' });

      manager.reconcile(enlace);

      expect(manager.getClip(filaAntigua.id)?.title).toBe('mi jugada');
    });

    it('las pistas muteadas no vacías ganan; si las dos tienen, las de la conservada', () => {
      const a = crearManager();
      const { filaAntigua } = duplicado(a, {}, { mutedTracks: ['mic'] });
      a.reconcile(enlace);
      expect(a.getClip(filaAntigua.id)?.mutedTracks).toEqual(['mic']);

      db.exec('DELETE FROM clips;');
      real.rmdirSync(enlace);
      const b = crearManager();
      const otra = duplicado(b, { mutedTracks: ['juego'] }, { mutedTracks: ['mic'] });
      b.reconcile(enlace);
      expect(b.getClip(otra.filaAntigua.id)?.mutedTracks).toEqual(['juego']);
    });

    it('al re-apuntar una sola fila también se escribe el tamaño real', () => {
      const ruta = archivo('Fortnite', 'a.mp4');
      enlazar(enlace);
      const manager = crearManager();
      const fila = insertar(ruta); // 1234 en la DB, 18 en disco

      manager.reconcile(enlace);

      expect(manager.getClip(fila.id)?.sizeBytes).toBe(18);
    });
  });

  describe('identidad física: sistemas de archivos sin índice fiable', () => {
    /** Pone `ino`/`birthtimeNs` de los `stat` bigint de los archivos bajo cada carpeta. */
    function identidadFalsa(porCarpeta: Record<string, { ino: bigint; birth: bigint }>): void {
      vi.mocked(statSync).mockImplementation(((path: fs.PathLike, opts?: unknown) => {
        const st = real.statSync(path, opts as never);
        if (!(opts as { bigint?: boolean })?.bigint) return st;
        for (const [carpeta, id] of Object.entries(porCarpeta)) {
          if (String(path).startsWith(carpeta)) {
            return { ...st, ino: id.ino, birthtimeNs: id.birth };
          }
        }
        return st;
      }) as typeof statSync);
    }

    /** Original en la carpeta vieja (con fila) y una COPIA con el mismo nombre y tamaño en la de clips. */
    function originalYCopia() {
      const original = join(viejaDir, 'Fortnite', 'a.mp4');
      mkdirSync(join(viejaDir, 'Fortnite'), { recursive: true });
      writeFileSync(original, 'contenido-de-video');
      mkdirSync(join(outputDir, 'Fortnite'), { recursive: true });
      real.copyFileSync(original, join(outputDir, 'Fortnite', 'a.mp4'));
      const manager = crearManager();
      insertar(original, 'original');
      return manager;
    }

    it('mismo índice y tamaño pero otra fecha de creación (copia del Explorador en ReFS): no se fusionan', () => {
      identidadFalsa({
        [viejaDir]: { ino: 7n, birth: 1n },
        [outputDir]: { ino: 7n, birth: 2n },
      });
      const manager = originalYCopia();

      expect(manager.reconcile(outputDir)).toEqual({ added: 1, removed: 0 });
      expect(manager.list()).toHaveLength(2);
    });

    it('control: con la misma fecha de creación sí es el mismo archivo', () => {
      identidadFalsa({
        [viejaDir]: { ino: 7n, birth: 1n },
        [outputDir]: { ino: 7n, birth: 1n },
      });
      const manager = originalYCopia();

      expect(manager.reconcile(outputDir)).toEqual({ added: 0, removed: 0 });
      expect(manager.list()).toHaveLength(1);
    });

    it('un índice FILE_INVALID_FILE_ID (0xFFFFFFFFFFFFFFFF) no identifica', () => {
      const invalido = 0xffffffffffffffffn;
      identidadFalsa({
        [viejaDir]: { ino: invalido, birth: 1n },
        [outputDir]: { ino: invalido, birth: 1n },
      });
      const manager = originalYCopia();

      expect(manager.reconcile(outputDir)).toEqual({ added: 1, removed: 0 });
      expect(manager.list()).toHaveLength(2);
    });

    it('medido: por un junction y por un hard link la fecha de creación es la del original', () => {
      const original = archivo('Fortnite', 'a.mp4');
      enlazar(enlace);
      real.linkSync(original, join(outputDir, 'duro.mp4'));
      const nacimiento = (p: string) => real.statSync(p, { bigint: true }).birthtimeNs;

      expect(nacimiento(join(enlace, 'Fortnite', 'a.mp4'))).toBe(nacimiento(original));
      expect(nacimiento(join(outputDir, 'duro.mp4'))).toBe(nacimiento(original));
    });
  });
});

interface ClipFixture {
  title: string;
  favorite: boolean;
  mutedTracks: string[];
}

describe('LibraryManager.reconcile — rescate de filas muertas que cambiaron de ruta', () => {
  // Las bajas se aplican al final del escaneo: una fila cuyo archivo falta puede ser un archivo que
  // se movió y que el escaneo está a punto de encontrar. Sin esto, deshacer un re-apuntado (volver a
  // la ruta real tras un junction, o a \\nas tras un Z: que no se reconectó) o renombrar la carpeta de
  // clips daba de baja la fila con todos sus datos y la daba de alta de nuevo vacía.
  const enlace = join(dir, 'enlace-rescate');
  const otroEnlace = join(dir, 'otro-enlace-rescate');
  const renombrada = join(dir, 'salida-renombrada');
  const otraCarpeta = join(dir, 'otra-carpeta-rescate');

  function limpiar(): void {
    for (const e of [enlace, otroEnlace]) {
      if (real.existsSync(e)) real.rmdirSync(e); // quita solo el junction, no su destino
    }
    rmSync(renombrada, { recursive: true, force: true });
    rmSync(otraCarpeta, { recursive: true, force: true });
  }
  beforeEach(limpiar);
  afterEach(limpiar);

  /** Fila de un archivo que existe, con el tamaño real y todo lo que el usuario pudo ponerle. */
  function clipEditado(manager: LibraryManager, ruta: string) {
    const fila = repo.insert({
      filePath: ruta,
      title: 'mi jugada',
      game: 'Fortnite',
      sizeBytes: real.statSync(ruta).size,
      createdAt: '2026-07-01T10:00:00.000Z',
      source: 'replay',
    });
    manager.updateClip(fila.id, { favorite: true, tags: ['final', 'clutch'] });
    manager.setClipMedia(fila.id, { durationSeconds: 12.5, thumbnailDataUrl: dataUrl });
    return fila;
  }

  function conservaTodo(manager: LibraryManager, id: number, ruta: string): void {
    const clip = manager.getClip(id);
    expect(clip?.filePath).toBe(ruta);
    expect(clip?.title).toBe('mi jugada');
    expect(clip?.favorite).toBe(true);
    expect(clip?.tags.sort()).toEqual(['clutch', 'final']);
    expect(clip?.durationSeconds).toBe(12.5);
    expect(existsSync(clip!.thumbnailPath!)).toBe(true);
  }

  it('el escenario del revisor: re-apuntar a un junction, borrarlo y volver a la ruta real conserva la fila', () => {
    const ruta = archivo('Fortnite', 'a.mp4');
    const manager = crearManager();
    const fila = clipEditado(manager, ruta);
    real.symlinkSync(outputDir, enlace, 'junction');
    expect(manager.reconcile(enlace)).toEqual({ added: 0, removed: 0 }); // re-apunta al junction
    real.rmdirSync(enlace); // el owner borra el junction y vuelve a la ruta real

    expect(manager.reconcile(outputDir)).toEqual({ added: 0, removed: 0 });

    expect(manager.list()).toHaveLength(1);
    conservaTodo(manager, fila.id, ruta);
  });

  it('la variante Z:/UNC: el camino por el que se re-apuntó desaparece y se vuelve por otro', () => {
    const ruta = archivo('Fortnite', 'a.mp4');
    const manager = crearManager();
    const fila = clipEditado(manager, ruta);
    real.symlinkSync(outputDir, enlace, 'junction'); // «Z:»
    manager.reconcile(enlace);
    real.rmdirSync(enlace); // «Z:» no se reconecta al iniciar sesión
    real.symlinkSync(outputDir, otroEnlace, 'junction'); // el owner vuelve por «\\nas\…»

    expect(manager.reconcile(otroEnlace)).toEqual({ added: 0, removed: 0 });

    expect(manager.list()).toHaveLength(1);
    conservaTodo(manager, fila.id, join(otroEnlace, 'Fortnite', 'a.mp4'));
  });

  it('carpeta de clips renombrada: sus filas, muertas, siguen a los archivos y conservan todo', () => {
    const ruta = archivo('Fortnite', 'a.mp4');
    const otro = archivo('Terraria', 'b.mp4');
    const manager = crearManager();
    const fila = clipEditado(manager, ruta);
    const filaB = clipEditado(manager, otro);
    real.renameSync(outputDir, renombrada); // el owner mueve la carpeta y apunta GameClip a la nueva

    expect(manager.reconcile(renombrada)).toEqual({ added: 0, removed: 0 });

    expect(manager.list()).toHaveLength(2);
    conservaTodo(manager, fila.id, join(renombrada, 'Fortnite', 'a.mp4'));
    conservaTodo(manager, filaB.id, join(renombrada, 'Terraria', 'b.mp4'));
  });

  describe('sin ver ningún archivo no se borra lo de dentro de la carpeta', () => {
    // Con la app cerrada se borra el junction (o se renombra la carpeta): al arrancar, el escaneo corre
    // antes de que la captura cree la carpeta, o la encuentra recién creada y vacía. Borrar entonces las
    // filas perdía título, favorito y etiquetas; en `main` la fila original nunca se movía y sobrevivía.
    function junctionRepuntado(manager: LibraryManager) {
      const ruta = archivo('Fortnite', 'a.mp4');
      const fila = clipEditado(manager, ruta);
      real.symlinkSync(outputDir, enlace, 'junction');
      expect(manager.reconcile(enlace)).toEqual({ added: 0, removed: 0 }); // re-apunta al junction
      real.rmdirSync(enlace); // el owner lo borra con la app cerrada
      return { ruta, fila };
    }

    it('junction borrado con la app cerrada (carpeta inexistente): la fila sobrevive y se rescata al volver', () => {
      const manager = crearManager();
      const { ruta, fila } = junctionRepuntado(manager);

      expect(manager.reconcile(enlace)).toEqual({ added: 0, removed: 0 }); // el arranque

      expect(manager.getClip(fila.id)).not.toBeNull();
      expect(manager.reconcile(outputDir)).toEqual({ added: 0, removed: 0 }); // vuelve a la ruta real
      expect(manager.list()).toHaveLength(1);
      conservaTodo(manager, fila.id, ruta);
    });

    it('junction borrado y carpeta recreada vacía (el mkdir del pipeline): lo mismo', () => {
      const manager = crearManager();
      const { ruta, fila } = junctionRepuntado(manager);
      mkdirSync(enlace);

      expect(manager.reconcile(enlace)).toEqual({ added: 0, removed: 0 });

      expect(manager.getClip(fila.id)).not.toBeNull();
      expect(manager.reconcile(outputDir)).toEqual({ added: 0, removed: 0 });
      expect(manager.list()).toHaveLength(1);
      conservaTodo(manager, fila.id, ruta);
    });

    it('carpeta renombrada con la app cerrada: el arranque no pierde nada y al apuntar a la nueva se rescata', () => {
      const manager = crearManager();
      const fila = clipEditado(manager, archivo('Fortnite', 'a.mp4'));
      real.renameSync(outputDir, renombrada);

      expect(manager.reconcile(outputDir)).toEqual({ added: 0, removed: 0 }); // arranque: la carpeta no está

      expect(manager.getClip(fila.id)).not.toBeNull();
      expect(manager.reconcile(renombrada)).toEqual({ added: 0, removed: 0 });
      conservaTodo(manager, fila.id, join(renombrada, 'Fortnite', 'a.mp4'));
    });

    it('con al menos un archivo en la carpeta, las muertas sin pareja se siguen borrando', () => {
      const manager = crearManager();
      const ruta = archivo('Fortnite', 'a.mp4');
      const muerta = clipEditado(manager, ruta);
      rmSync(ruta);
      archivo('Terraria', 'otro-clip.mp4'); // distinto nombre: no es pareja

      expect(manager.reconcile(outputDir)).toEqual({ added: 1, removed: 1 });
      expect(manager.getClip(muerta.id)).toBeNull();
    });

    it('las muertas de fuera de la carpeta se siguen borrando aunque el escaneo esté vacío', () => {
      const manager = crearManager();
      const muerta = repo.insert({
        filePath: `${unidadAusente()}Clips\\a.mp4`,
        title: 'otra carpeta',
        game: null,
        sizeBytes: 18,
        createdAt: '2026-07-01T10:00:00.000Z',
        source: 'replay',
      });

      expect(manager.reconcile(outputDir)).toEqual({ added: 0, removed: 1 }); // carpeta vacía
      expect(manager.getClip(muerta.id)).toBeNull();
    });

    it('heldIds: solo las retenidas de la última pasada; se vacía si la red no actúa y deleteClip la saca', async () => {
      const manager = crearManager();
      const ruta = archivo('Fortnite', 'a.mp4');
      const dentro = clipEditado(manager, ruta);
      rmSync(ruta);
      const fuera = repo.insert({
        filePath: `${unidadAusente()}Clips\\b.mp4`,
        title: 'otra carpeta',
        game: null,
        sizeBytes: 18,
        createdAt: '2026-07-01T10:00:00.000Z',
        source: 'replay',
      });
      expect(manager.heldIds().size).toBe(0); // antes de cualquier escaneo
      const cambios = vi.fn();
      manager.on('changed', cambios);

      manager.reconcile(outputDir); // carpeta vacía

      expect([...manager.heldIds()]).toEqual([dentro.id]); // la de fuera se borró, no se retiene
      expect(manager.getClip(fuera.id)).toBeNull();
      expect(cambios).toHaveBeenCalled(); // el uso cambia: el renderer debe releerlo
      cambios.mockClear();
      manager.reconcile(outputDir); // misma situación: nada nuevo que avisar
      expect(cambios).not.toHaveBeenCalled();

      await manager.deleteClip(dentro.id);
      expect(manager.heldIds().size).toBe(0);

      const otra = clipEditado(manager, archivo('Fortnite', 'c.mp4'));
      rmSync(join(outputDir, 'Fortnite', 'c.mp4'));
      manager.reconcile(outputDir);
      expect([...manager.heldIds()]).toEqual([otra.id]);
      archivo('Terraria', 'otro.mp4'); // aparece un archivo: la red deja de actuar
      manager.reconcile(outputDir);
      expect(manager.heldIds().size).toBe(0);
      expect(manager.getClip(otra.id)).toBeNull();
    });

    it('la carpeta ilegible entera tampoco borra lo de dentro', () => {
      const ruta = archivo('Fortnite', 'a.mp4');
      const manager = crearManager();
      const fila = clipEditado(manager, ruta);
      rmSync(ruta);
      sinPermisoEn(outputDir);

      expect(manager.reconcile(outputDir)).toEqual({ added: 0, removed: 0 });
      expect(manager.getClip(fila.id)).not.toBeNull();
    });
  });

  it('la copia con el USB ya quitado: la fila muerta del USB sigue al archivo copiado', () => {
    const copia = archivo('Fortnite', 'a.mp4');
    const unidad = unidadAusente();
    const manager = crearManager();
    const fila = repo.insert({
      filePath: `${unidad}Clips\\Fortnite\\a.mp4`,
      title: 'mi jugada',
      game: 'Fortnite',
      sizeBytes: real.statSync(copia).size,
      createdAt: '2026-07-01T10:00:00.000Z',
      source: 'replay',
    });
    manager.updateClip(fila.id, { favorite: true });

    expect(manager.reconcile(outputDir)).toEqual({ added: 0, removed: 0 });

    expect(manager.list()).toHaveLength(1);
    expect(manager.getClip(fila.id)?.filePath).toBe(copia);
    expect(manager.getClip(fila.id)?.favorite).toBe(true);
  });

  it('ambigüedad: dos filas muertas con el mismo nombre → no se rescata ninguna', () => {
    archivo('Fortnite', 'a.mp4');
    const manager = crearManager();
    const unidad = unidadAusente();
    for (const juego of ['Fortnite', 'Terraria']) {
      repo.insert({
        filePath: `${unidad}Clips\\${juego}\\a.mp4`,
        title: juego,
        game: null,
        sizeBytes: 18,
        createdAt: '2026-07-01T10:00:00.000Z',
        source: 'replay',
      });
    }

    expect(manager.reconcile(outputDir)).toEqual({ added: 1, removed: 2 });
    expect(manager.list().map((c) => c.title)).toEqual(['a']);
  });

  it('ambigüedad: dos archivos sin fila con el mismo nombre → no se rescata nada', () => {
    archivo('Fortnite', 'a.mp4');
    archivo('Terraria', 'a.mp4');
    const manager = crearManager();
    repo.insert({
      filePath: `${unidadAusente()}Clips\\a.mp4`,
      title: 'muerto',
      game: null,
      sizeBytes: 18,
      createdAt: '2026-07-01T10:00:00.000Z',
      source: 'replay',
    });

    expect(manager.reconcile(outputDir)).toEqual({ added: 2, removed: 1 });
    expect(manager.list().map((c) => c.title)).toEqual(['a', 'a']);
  });

  it('un tamaño distinto no es el mismo archivo: no se rescata', () => {
    archivo('Fortnite', 'a.mp4'); // 18 bytes
    const manager = crearManager();
    const muerto = repo.insert({
      filePath: `${unidadAusente()}Clips\\a.mp4`,
      title: 'muerto',
      game: null,
      sizeBytes: 999,
      createdAt: '2026-07-01T10:00:00.000Z',
      source: 'replay',
    });

    expect(manager.reconcile(outputDir)).toEqual({ added: 1, removed: 1 });
    expect(manager.getClip(muerto.id)).toBeNull();
  });

  it('un archivo de dentro que ya tiene fila no se toca: la muerta del mismo nombre se da de baja', () => {
    const ruta = archivo('Fortnite', 'a.mp4');
    const manager = crearManager();
    const vivo = clipEditado(manager, ruta);
    const muerto = repo.insert({
      filePath: `${unidadAusente()}Clips\\a.mp4`,
      title: 'muerto',
      game: null,
      sizeBytes: 18,
      createdAt: '2026-07-01T10:00:00.000Z',
      source: 'replay',
    });
    const miniatura = manager.setClipMedia(muerto.id, {
      thumbnailDataUrl: dataUrl,
    }).thumbnailPath!;

    expect(manager.reconcile(outputDir)).toEqual({ added: 0, removed: 1 });

    conservaTodo(manager, vivo.id, ruta);
    expect(manager.getClip(muerto.id)).toBeNull();
    expect(existsSync(miniatura)).toBe(false); // la baja sigue limpiando la miniatura
  });

  it('una fila muerta sin pareja se da de baja como siempre, con su miniatura', () => {
    const manager = crearManager();
    const ruta = archivo('Fortnite', 'a.mp4');
    const muerto = clipEditado(manager, ruta);
    const miniatura = manager.getClip(muerto.id)!.thumbnailPath!;
    rmSync(ruta);
    insertar(archivo('Terraria', 'b.mp4')); // la carpeta no está vacía: el escaneo ve archivos

    expect(manager.reconcile(outputDir)).toEqual({ added: 0, removed: 1 });
    expect(manager.getClip(muerto.id)).toBeNull();
    expect(existsSync(miniatura)).toBe(false);
  });

  it('la unidad de la carpeta de clips sin montar sigue como estaba: no hay filas muertas', () => {
    const salida = `${unidadAusente()}Clips`;
    const manager = crearManager();
    const fila = repo.insert({
      filePath: `${salida}\\Fortnite\\a.mp4`,
      title: 'en el USB',
      game: null,
      sizeBytes: 18,
      createdAt: '2026-07-01T10:00:00.000Z',
      source: 'replay',
    });

    expect(manager.reconcile(salida)).toEqual({ added: 0, removed: 0 });
    expect(manager.getClip(fila.id)?.title).toBe('en el USB');
  });

  it('un archivo que aparece entre la comprobación de la fila y el escaneo no pierde su fila', () => {
    const ruta = archivo('Fortnite', 'a.mp4');
    const manager = crearManager();
    const fila = clipEditado(manager, ruta);
    let primera = true;
    vi.mocked(existsSync).mockImplementation((p) => {
      if (String(p) === ruta && primera) {
        primera = false;
        return false; // todavía no estaba (p. ej. un remux que lo acaba de renombrar)
      }
      return real.existsSync(p);
    });

    expect(manager.reconcile(outputDir)).toEqual({ added: 0, removed: 0 });

    conservaTodo(manager, fila.id, ruta);
  });

  it('un fallo al re-apuntar no corta el escaneo: se comporta como antes (baja + alta)', () => {
    archivo('Fortnite', 'a.mp4');
    archivo('Terraria', 'b.mp4');
    const manager = crearManager();
    const muerto = repo.insert({
      filePath: `${unidadAusente()}Clips\\a.mp4`,
      title: 'muerto',
      game: null,
      sizeBytes: 18,
      createdAt: '2026-07-01T10:00:00.000Z',
      source: 'replay',
    });
    const rota = vi.spyOn(repo, 'setPath').mockImplementation(() => {
      throw new Error('DB bloqueada');
    });
    const errores = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    let resultado: { added: number; removed: number } | undefined;
    try {
      resultado = manager.reconcile(outputDir);
    } finally {
      rota.mockRestore();
      errores.mockRestore();
    }

    expect(resultado).toEqual({ added: 2, removed: 1 });
    expect(manager.getClip(muerto.id)).toBeNull();
  });
});
