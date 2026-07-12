import type { Server } from 'node:http';
import { SERVER_PORT } from '../src/shared/config';
import { createApp } from './app';
import { openDatabase, type SqliteDriver } from './db/database';

export interface ApiOptions {
  /** Constructor de better-sqlite3 con la ABI del proceso que llama (ver `SqliteDriver`). */
  driver: SqliteDriver;
  dbPath: string;
  port?: number;
  /** Fallo de `listen` (típicamente EADDRINUSE); llega asíncrono, por eso es un callback. */
  onError?: (err: NodeJS.ErrnoException) => void;
}

export interface ApiHandle {
  close(): void;
}

/**
 * Levanta la API. La usan las dos vías: `dev:server` (proceso Node aparte) y el main de Electron,
 * que la corre embebida — un proceso hijo no evitaría nada, porque también correría el runtime de
 * Electron y necesitaría la misma ABI para los módulos nativos.
 */
export function startApi(options: ApiOptions): ApiHandle {
  const port = options.port ?? SERVER_PORT;
  const db = openDatabase(options.driver, options.dbPath);
  const server: Server = createApp(db).listen(port, () => {
    console.log(`[server] GameClip API escuchando en http://localhost:${port}`);
  });
  server.on('error', (err: NodeJS.ErrnoException) => options.onError?.(err));

  return {
    close(): void {
      server.close();
      db.close();
    },
  };
}
