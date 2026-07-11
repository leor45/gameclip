import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3-electron';

// Abre la DB de la biblioteca con el binario ABI-Electron. Solo se importa en runtime
// (main); los tests usan better-sqlite3 de Node directamente contra el repositorio.
export function openLibraryDatabase(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  return db;
}
