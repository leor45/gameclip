import Database from 'better-sqlite3';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ClipsRepository, type NewClip } from '../library/clips-repository';

const db = new Database(':memory:');
const repo = new ClipsRepository(db);

afterAll(() => db.close());

beforeEach(() => {
  db.exec('DELETE FROM clips;');
});

let contador = 0;
function nuevo(parcial: Partial<NewClip> = {}): NewClip {
  contador++;
  return {
    filePath: `C:\\Videos\\GameClip\\clip-${contador}.mp4`,
    title: `Clip ${contador}`,
    game: null,
    sizeBytes: 1000 + contador,
    createdAt: `2026-07-0${(contador % 9) + 1}T10:00:00.000Z`,
    source: 'replay',
    ...parcial,
  };
}

describe('ClipsRepository — CRUD', () => {
  it('inserta y lee un clip con defaults', () => {
    const clip = repo.insert(nuevo({ game: 'Valorant' }));

    expect(clip.id).toBeGreaterThan(0);
    expect(clip.game).toBe('Valorant');
    expect(clip.favorite).toBe(false);
    expect(clip.tags).toEqual([]);
    expect(clip.durationSeconds).toBeNull();
    expect(clip.thumbnailPath).toBeNull();
    expect(repo.get(clip.id)).toEqual(clip);
    expect(repo.getByPath(clip.filePath)).toEqual(clip);
  });

  it('actualiza título, juego, favorito y tags (normalizados)', () => {
    const clip = repo.insert(nuevo());
    const actualizado = repo.update(clip.id, {
      title: 'Ace clutch',
      game: 'CS2',
      favorite: true,
      tags: ['ace', 'ACE', ' clutch '],
    });

    expect(actualizado.title).toBe('Ace clutch');
    expect(actualizado.game).toBe('CS2');
    expect(actualizado.favorite).toBe(true);
    expect(actualizado.tags).toEqual(['ace', 'clutch']);
  });

  it('update con id inexistente lanza', () => {
    expect(() => repo.update(999, { title: 'x' })).toThrow(/no existe/i);
  });

  it('setMedia guarda duración y thumbnail por separado', () => {
    const clip = repo.insert(nuevo());
    repo.setMedia(clip.id, { durationSeconds: 42.5 });
    const conThumb = repo.setMedia(clip.id, { thumbnailPath: 'C:\\thumbs\\1.jpg' });

    expect(conThumb.durationSeconds).toBe(42.5);
    expect(conThumb.thumbnailPath).toBe('C:\\thumbs\\1.jpg');
  });

  it('elimina un clip', () => {
    const clip = repo.insert(nuevo());
    repo.delete(clip.id);
    expect(repo.get(clip.id)).toBeNull();
  });

  it('rechaza rutas duplicadas', () => {
    const datos = nuevo();
    repo.insert(datos);
    expect(() => repo.insert(datos)).toThrow();
  });
});

describe('ClipsRepository — búsqueda y filtros', () => {
  it('ordena por fecha descendente', () => {
    repo.insert(nuevo({ createdAt: '2026-07-01T10:00:00.000Z', title: 'viejo' }));
    repo.insert(nuevo({ createdAt: '2026-07-09T10:00:00.000Z', title: 'nuevo' }));

    expect(repo.list().map((c) => c.title)).toEqual(['nuevo', 'viejo']);
  });

  it('busca por título, juego y tags sin distinguir mayúsculas', () => {
    repo.insert(nuevo({ title: 'Pentakill mid' }));
    const conJuego = repo.insert(nuevo({ game: 'Rocket League' }));
    const conTag = repo.insert(nuevo());
    repo.update(conTag.id, { tags: ['pentakill'] });

    expect(repo.list({ search: 'PENTA' })).toHaveLength(2);
    expect(repo.list({ search: 'rocket' })[0].id).toBe(conJuego.id);
    expect(repo.list({ search: 'no-existe' })).toHaveLength(0);
  });

  it('escapa comodines de LIKE en la búsqueda', () => {
    repo.insert(nuevo({ title: 'progreso 100%' }));
    repo.insert(nuevo({ title: 'cien' }));

    expect(repo.list({ search: '100%' })).toHaveLength(1);
    expect(repo.list({ search: '%' })).toHaveLength(1);
  });

  it('filtra favoritos y juego combinados', () => {
    const fav = repo.insert(nuevo({ game: 'CS2' }));
    repo.update(fav.id, { favorite: true });
    repo.insert(nuevo({ game: 'CS2' }));
    repo.insert(nuevo({ game: 'Valorant' }));

    expect(repo.list({ favoritesOnly: true })).toHaveLength(1);
    expect(repo.list({ game: 'CS2' })).toHaveLength(2);
    expect(repo.list({ favoritesOnly: true, game: 'Valorant' })).toHaveLength(0);
  });

  it('games() devuelve juegos distintos ordenados', () => {
    repo.insert(nuevo({ game: 'Valorant' }));
    repo.insert(nuevo({ game: 'CS2' }));
    repo.insert(nuevo({ game: 'CS2' }));
    repo.insert(nuevo());

    expect(repo.games()).toEqual(['CS2', 'Valorant']);
  });
});

describe('ClipsRepository — edit de audio', () => {
  it('un clip nuevo no tiene pistas muteadas', () => {
    expect(repo.insert(nuevo()).mutedTracks).toEqual([]);
  });

  it('setAudioEdit guarda las pistas muteadas y el tamaño del archivo reescrito', () => {
    const clip = repo.insert(nuevo({ sizeBytes: 5000 }));

    const editado = repo.setAudioEdit(clip.id, ['mic', 'mic', ' opera '], 4800);

    expect(editado.mutedTracks).toEqual(['mic', 'opera']); // normalizado: sin duplicados ni espacios
    expect(editado.sizeBytes).toBe(4800);
    expect(repo.get(clip.id)?.mutedTracks).toEqual(['mic', 'opera']);
  });

  it('desmutear todo deja la selección vacía', () => {
    const clip = repo.insert(nuevo());
    repo.setAudioEdit(clip.id, ['mic'], 100);

    expect(repo.setAudioEdit(clip.id, [], 120).mutedTracks).toEqual([]);
  });
});

describe('ClipsRepository — migración', () => {
  it('añade muted_tracks a una DB con el esquema viejo (v1)', () => {
    const vieja = new Database(':memory:');
    vieja.exec(`CREATE TABLE clips (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       file_path TEXT NOT NULL UNIQUE, title TEXT NOT NULL, game TEXT,
       duration_seconds REAL, size_bytes INTEGER NOT NULL DEFAULT 0,
       favorite INTEGER NOT NULL DEFAULT 0, tags TEXT NOT NULL DEFAULT '[]',
       thumbnail_path TEXT, created_at TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'scan');
     INSERT INTO clips (file_path, title, created_at) VALUES ('C:\viejo.mp4', 'Viejo', '2026-01-01T00:00:00.000Z');
     PRAGMA user_version = 1;`);

    const migrado = new ClipsRepository(vieja);

    expect(migrado.getByPath('C:\viejo.mp4')?.mutedTracks).toEqual([]);
    vieja.close();
  });
});

describe('ClipsRepository — rutas canónicas y duplicados', () => {
  it('guarda la ruta canónica aunque llegue con separadores mezclados (la de libobs)', () => {
    const clip = repo.insert(nuevo({ filePath: 'D:\\Videos\\GameClip/clip.mp4' }));

    expect(clip.filePath).toBe('D:\\Videos\\GameClip\\clip.mp4');
    expect(repo.getByPath('D:\\Videos\\GameClip/clip.mp4')?.id).toBe(clip.id);
    expect(repo.getByPath('D:\\Videos\\GameClip\\clip.mp4')?.id).toBe(clip.id);
    // NTFS no distingue mayúsculas: la misma ruta en otra capitalización es el mismo clip.
    expect(repo.getByPath('d:\\videos\\gameclip\\CLIP.mp4')?.id).toBe(clip.id);
  });

  it('la DB rechaza dos filas para el mismo archivo, aunque la ruta venga escrita distinto', () => {
    repo.insert(nuevo({ filePath: 'D:\\Videos\\GameClip\\clip.mp4' }));

    expect(() => repo.insert(nuevo({ filePath: 'D:\\Videos\\GameClip/CLIP.mp4' }))).toThrow();
  });
});

describe('ClipsRepository — migración: fusión de duplicados existentes', () => {
  /** Siembra el esquema v2 (sin canonicalizar), como la DB del usuario antes del fix. */
  function dbV2() {
    const vieja = new Database(':memory:');
    vieja.exec(`CREATE TABLE clips (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       file_path TEXT NOT NULL UNIQUE, title TEXT NOT NULL, game TEXT,
       duration_seconds REAL, size_bytes INTEGER NOT NULL DEFAULT 0,
       favorite INTEGER NOT NULL DEFAULT 0, tags TEXT NOT NULL DEFAULT '[]',
       thumbnail_path TEXT, created_at TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'scan',
       muted_tracks TEXT NOT NULL DEFAULT '[]');
     PRAGMA user_version = 2;`);
    return vieja;
  }

  function sembrar(db: Database.Database, fila: Record<string, unknown>): void {
    const cols = Object.keys(fila);
    db.prepare(
      `INSERT INTO clips (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    ).run(...cols.map((c) => fila[c]));
  }

  it('deja un solo clip por archivo y conserva los datos de ambas filas', () => {
    const vieja = dbV2();
    // Las dos filas reales: la de la captura (ruta de libobs, con miniatura y duración) …
    sembrar(vieja, {
      id: 107,
      file_path: 'D:\\Videos\\GameClip/clip.mp4',
      title: 'clip',
      duration_seconds: 10.9,
      size_bytes: 14300323,
      thumbnail_path: 'C:\\thumbs\\107.jpg',
      created_at: '2026-07-12T00:14:57.640Z',
      source: 'recording',
      tags: '["clutch"]',
    });
    // … y la que metió el reconcile con el separador nativo, marcada como favorita por el usuario.
    sembrar(vieja, {
      id: 108,
      file_path: 'D:\\Videos\\GameClip\\clip.mp4',
      title: 'clip',
      size_bytes: 14282290,
      favorite: 1,
      thumbnail_path: 'C:\\thumbs\\108.jpg',
      game: 'Valorant',
      created_at: '2026-07-12T00:14:57.640Z',
      source: 'scan',
      tags: '["ace"]',
    });

    const migrado = new ClipsRepository(vieja);

    const clips = migrado.list();
    expect(clips).toHaveLength(1);
    const clip = clips[0];
    expect(clip.id).toBe(107); // el id menor: sus miniaturas y URLs de medios siguen valiendo
    expect(clip.filePath).toBe('D:\\Videos\\GameClip\\clip.mp4'); // canonicalizada
    expect(clip.durationSeconds).toBe(10.9);
    expect(clip.thumbnailPath).toBe('C:\\thumbs\\107.jpg');
    expect(clip.source).toBe('recording'); // 'scan' es el alta genérica: pierde
    expect(clip.favorite).toBe(true); // el favorito estaba en la fila descartada
    expect(clip.game).toBe('Valorant'); // el juego también
    expect(clip.tags.sort()).toEqual(['ace', 'clutch']); // etiquetas unidas
    // La miniatura del registro descartado queda anotada para que el manager la borre.
    expect(migrado.takeOrphanThumbnails()).toEqual(['C:\\thumbs\\108.jpg']);
    expect(migrado.takeOrphanThumbnails()).toEqual([]); // se consumen una sola vez
    vieja.close();
  });

  it('sin duplicados solo canonicaliza la ruta', () => {
    const vieja = dbV2();
    sembrar(vieja, {
      id: 1,
      file_path: 'D:\\Videos\\GameClip/solo.mp4',
      title: 'solo',
      size_bytes: 100,
      created_at: '2026-07-01T00:00:00.000Z',
      source: 'replay',
    });

    const migrado = new ClipsRepository(vieja);

    expect(migrado.list()).toHaveLength(1);
    expect(migrado.list()[0].filePath).toBe('D:\\Videos\\GameClip\\solo.mp4');
    expect(migrado.takeOrphanThumbnails()).toEqual([]);
    vieja.close();
  });
});
