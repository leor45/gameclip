import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ClipsRepository } from '../library/clips-repository';
import { migrateClipLayout } from '../library/migrate-layout';

const dir = mkdtempSync(join(tmpdir(), 'gameclip-migrate-'));
const salida = join(dir, 'clips');
const db = new Database(':memory:');
const repo = new ClipsRepository(db);

afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec('DELETE FROM clips;');
  rmSync(salida, { recursive: true, force: true });
  mkdirSync(salida, { recursive: true });
});

/** Crea el archivo y lo registra en el catálogo, como estaba en el layout viejo. */
function clipViejo(nombre: string, game: string | null, createdAt: string) {
  const filePath = join(salida, nombre);
  writeFileSync(filePath, 'video');
  return repo.insert({
    filePath,
    title: nombre.replace(/\.mp4$/, ''),
    game,
    sizeBytes: 5,
    createdAt,
    source: 'replay',
  });
}

describe('migrateClipLayout', () => {
  it('mueve los clips sueltos a la carpeta de su juego y actualiza el catálogo', () => {
    const clip = clipViejo('Replay 2026-07-11.mp4', 'Terraria', '2026-07-02T13:02:01.010Z');

    const resultado = migrateClipLayout(repo, salida);

    expect(resultado.movedClips).toBe(1);
    const migrado = repo.get(clip.id)!;
    // La base sale del ejecutable de la lista curada (`terraria.exe`); NTFS ignora mayúsculas,
    // así que es la misma carpeta que crearía una detección real (`Terraria.exe`).
    expect(migrado.filePath).toMatch(/\\terraria\\terraria \d{4}\.\d{2}\.\d{2} - .+\.mp4$/i);
    expect(existsSync(migrado.filePath)).toBe(true);
    expect(readFileSync(migrado.filePath, 'utf8')).toBe('video');
    expect(existsSync(clip.filePath)).toBe(false); // ya no está suelto en la raíz
    expect(migrado.id).toBe(clip.id); // mismo id: la miniatura y las URLs de medios siguen valiendo
  });

  it('sin juego (o con uno desconocido) va a Desktop', () => {
    const sinJuego = clipViejo('2026-07-11 19-14-42.mp4', null, '2026-07-11T22:14:57.000Z');

    migrateClipLayout(repo, salida);

    expect(repo.get(sinJuego.id)!.filePath).toContain(join(salida, 'Desktop', 'Desktop '));
  });

  it('usa la fecha del clip (createdAt), no la de la migración', () => {
    const clip = clipViejo('viejo.mp4', 'Terraria', new Date(2025, 11, 22, 20, 47, 50, 780).toISOString());

    migrateClipLayout(repo, salida);

    expect(repo.get(clip.id)!.filePath.toLowerCase()).toContain(
      'terraria 2025.12.22 - 20.47.50.78.mp4',
    );
  });

  it('no toca lo que ya está en una subcarpeta', () => {
    const carpeta = join(salida, 'Terraria');
    mkdirSync(carpeta, { recursive: true });
    const yaMigrado = join(carpeta, 'Terraria 2026.07.02 - 10.02.01.01.mp4');
    writeFileSync(yaMigrado, 'video');
    const clip = repo.insert({
      filePath: yaMigrado,
      title: 'ya migrado',
      game: 'Terraria',
      sizeBytes: 5,
      createdAt: '2026-07-02T13:02:01.010Z',
      source: 'replay',
    });

    const resultado = migrateClipLayout(repo, salida);

    expect(resultado.movedClips).toBe(0);
    expect(repo.get(clip.id)!.filePath).toBe(yaMigrado);
  });

  it('mueve las capturas del viejo Capturas/ a Desktop/Capturas', () => {
    const viejo = join(salida, 'Capturas');
    mkdirSync(viejo, { recursive: true });
    writeFileSync(join(viejo, 'Captura 2026-07-11 19-00-00.png'), 'png');

    const resultado = migrateClipLayout(repo, salida);

    expect(resultado.movedScreenshots).toBe(1);
    expect(existsSync(join(viejo, 'Captura 2026-07-11 19-00-00.png'))).toBe(false);
    const destino = join(salida, 'Desktop', 'Capturas');
    expect(existsSync(destino)).toBe(true);
  });

  it('un clip cuyo archivo ya no existe no rompe la migración', () => {
    const clip = clipViejo('fantasma.mp4', null, '2026-07-11T22:14:57.000Z');
    rmSync(clip.filePath, { force: true });

    const resultado = migrateClipLayout(repo, salida);

    expect(resultado.movedClips).toBe(0);
    expect(repo.get(clip.id)!.filePath).toBe(clip.filePath); // la fila queda como estaba
  });
});
