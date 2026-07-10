import type { AppDatabase } from './database';

// Acceso a la tabla meta (pares clave/valor del sistema). Toda consulta SQL
// de meta vive aquí; el resto del server no toca la base directamente.
export class MetaRepository {
  constructor(private readonly db: AppDatabase) {}

  get(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  }

  set(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }
}
