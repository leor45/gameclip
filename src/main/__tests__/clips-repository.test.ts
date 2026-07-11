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
