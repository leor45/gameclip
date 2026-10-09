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

  it('con filas de fuera se mira la identidad de ellas y de cada archivo de dentro, y nada más', () => {
    // Carpeta anterior legítima con 2 clips (sin copiar), y la actual con 3 filas ya catalogadas más 1 nuevo.
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

    // 2 filas de fuera + los 4 archivos de dentro: una sola consulta por archivo, ninguna repetida.
    const consultados = bigint().map(([p]) => String(p));
    expect(consultados).toHaveLength(6);
    expect(new Set(consultados).size).toBe(6);
    expect(consultados).toContain(join(outputDir, 'nuevo.mp4'));
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
});
