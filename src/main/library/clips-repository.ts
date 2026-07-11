import type { Database } from 'better-sqlite3';
import type { Clip, ClipPatch, ClipSource, ClipsQuery } from '@shared/library';
import { normalizeTags } from '@shared/library';

// Migraciones secuenciales; la posición i lleva el esquema de la versión i a la i+1.
const migrations: string[] = [
  `CREATE TABLE clips (
     id               INTEGER PRIMARY KEY AUTOINCREMENT,
     file_path        TEXT NOT NULL UNIQUE,
     title            TEXT NOT NULL,
     game             TEXT,
     duration_seconds REAL,
     size_bytes       INTEGER NOT NULL DEFAULT 0,
     favorite         INTEGER NOT NULL DEFAULT 0,
     tags             TEXT NOT NULL DEFAULT '[]',
     thumbnail_path   TEXT,
     created_at       TEXT NOT NULL,
     source           TEXT NOT NULL DEFAULT 'scan'
   );
   CREATE INDEX idx_clips_created ON clips(created_at DESC);`,
];

interface ClipRow {
  id: number;
  file_path: string;
  title: string;
  game: string | null;
  duration_seconds: number | null;
  size_bytes: number;
  favorite: number;
  tags: string;
  thumbnail_path: string | null;
  created_at: string;
  source: string;
}

export interface NewClip {
  filePath: string;
  title: string;
  game: string | null;
  sizeBytes: number;
  createdAt: string;
  source: ClipSource;
}

/**
 * Catálogo de clips sobre SQLite. Recibe la conexión por constructor: en Electron el alias
 * con ABI de Electron, en tests el better-sqlite3 de Node con ':memory:'.
 */
export class ClipsRepository {
  constructor(private readonly db: Database) {
    this.migrate();
  }

  list(query: ClipsQuery = {}): Clip[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (query.search?.trim()) {
      const like = `%${escapeLike(query.search.trim())}%`;
      where.push(
        "(title LIKE ? ESCAPE '\\' OR ifnull(game, '') LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')",
      );
      params.push(like, like, like);
    }
    if (query.favoritesOnly) where.push('favorite = 1');
    if (query.game) {
      where.push('game = ?');
      params.push(query.game);
    }
    const sql = `SELECT * FROM clips ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY created_at DESC, id DESC`;
    return (this.db.prepare(sql).all(...params) as ClipRow[]).map(toClip);
  }

  get(id: number): Clip | null {
    const row = this.db.prepare('SELECT * FROM clips WHERE id = ?').get(id) as
      | ClipRow
      | undefined;
    return row ? toClip(row) : null;
  }

  getByPath(filePath: string): Clip | null {
    const row = this.db.prepare('SELECT * FROM clips WHERE file_path = ?').get(filePath) as
      | ClipRow
      | undefined;
    return row ? toClip(row) : null;
  }

  /** Rutas de todo el catálogo, para reconciliar contra el disco. */
  allPaths(): { id: number; filePath: string }[] {
    const rows = this.db.prepare('SELECT id, file_path FROM clips').all() as Pick<
      ClipRow,
      'id' | 'file_path'
    >[];
    return rows.map((r) => ({ id: r.id, filePath: r.file_path }));
  }

  /** Juegos distintos presentes, para el filtro de la UI. */
  games(): string[] {
    const rows = this.db
      .prepare('SELECT DISTINCT game FROM clips WHERE game IS NOT NULL ORDER BY game')
      .all() as { game: string }[];
    return rows.map((r) => r.game);
  }

  insert(clip: NewClip): Clip {
    const info = this.db
      .prepare(
        `INSERT INTO clips (file_path, title, game, size_bytes, created_at, source)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(clip.filePath, clip.title, clip.game, clip.sizeBytes, clip.createdAt, clip.source);
    return this.mustGet(Number(info.lastInsertRowid));
  }

  update(id: number, patch: ClipPatch): Clip {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.title !== undefined) {
      sets.push('title = ?');
      params.push(patch.title);
    }
    if (patch.game !== undefined) {
      sets.push('game = ?');
      params.push(patch.game);
    }
    if (patch.favorite !== undefined) {
      sets.push('favorite = ?');
      params.push(patch.favorite ? 1 : 0);
    }
    if (patch.tags !== undefined) {
      sets.push('tags = ?');
      params.push(JSON.stringify(normalizeTags(patch.tags)));
    }
    if (sets.length) {
      this.db.prepare(`UPDATE clips SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
    }
    return this.mustGet(id);
  }

  /** Metadatos calculados en el renderer (duración) o por el manager (thumbnail). */
  setMedia(id: number, media: { durationSeconds?: number; thumbnailPath?: string }): Clip {
    if (media.durationSeconds !== undefined) {
      this.db
        .prepare('UPDATE clips SET duration_seconds = ? WHERE id = ?')
        .run(media.durationSeconds, id);
    }
    if (media.thumbnailPath !== undefined) {
      this.db
        .prepare('UPDATE clips SET thumbnail_path = ? WHERE id = ?')
        .run(media.thumbnailPath, id);
    }
    return this.mustGet(id);
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM clips WHERE id = ?').run(id);
  }

  private mustGet(id: number): Clip {
    const clip = this.get(id);
    if (!clip) throw new Error(`Clip ${id} no existe.`);
    return clip;
  }

  private migrate(): void {
    const current = this.db.pragma('user_version', { simple: true }) as number;
    const apply = this.db.transaction(() => {
      for (let v = current; v < migrations.length; v++) {
        this.db.exec(migrations[v]);
        this.db.pragma(`user_version = ${v + 1}`);
      }
    });
    apply();
  }
}

function toClip(row: ClipRow): Clip {
  let tags: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.tags);
    if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string');
  } catch {
    // columna corrupta → sin tags
  }
  return {
    id: row.id,
    filePath: row.file_path,
    title: row.title,
    game: row.game,
    durationSeconds: row.duration_seconds,
    sizeBytes: row.size_bytes,
    favorite: row.favorite === 1,
    tags,
    thumbnailPath: row.thumbnail_path,
    createdAt: row.created_at,
    source: (['replay', 'recording', 'scan'] as const).find((s) => s === row.source) ?? 'scan',
  };
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}
