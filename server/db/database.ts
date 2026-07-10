import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';

export type AppDatabase = Database.Database;

export const SCHEMA_VERSION = 2;

// Relativa al cwd (raíz del repo en dev); configurable cuando llegue la distribución.
const DEFAULT_DB_PATH = join(process.cwd(), 'server', 'data', 'gameclip.db');

// Migraciones secuenciales; la posición i lleva el esquema de la versión i a la i+1.
const migrations: string[] = [
  `CREATE TABLE IF NOT EXISTS meta (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );`,
  `CREATE TABLE users (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
     password_hash TEXT NOT NULL,
     display_name  TEXT NOT NULL,
     created_at    TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE TABLE refresh_tokens (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     token_hash TEXT NOT NULL UNIQUE,
     expires_at TEXT NOT NULL,
     revoked_at TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);`,
];

export function openDatabase(path: string = DEFAULT_DB_PATH): AppDatabase {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

function migrate(db: AppDatabase): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  const apply = db.transaction(() => {
    for (let v = current; v < migrations.length; v++) {
      db.exec(migrations[v]);
      db.pragma(`user_version = ${v + 1}`);
    }
  });
  apply();
  db.prepare(
    `INSERT INTO meta (key, value) VALUES ('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(String(SCHEMA_VERSION));
}
