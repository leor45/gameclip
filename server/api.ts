import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SERVER_HOST, SERVER_PORT } from '../src/shared/config';
import { createApp } from './app';
import { openDatabase, type SqliteDriver } from './db/database';

export interface ApiOptions {
  /** Constructor de better-sqlite3 con la ABI del proceso que llama (ver `SqliteDriver`). */
  driver: SqliteDriver;
  dbPath: string;
  port?: number;
  /** Interfaz de escucha; por defecto solo el propio PC (`127.0.0.1`). */
  host?: string;
  /** Secreto JWT de la instalación (obligatorio: no hay uno por defecto fuera de los tests). */
  jwtSecret: string;
  /** Fallo de `listen` (típicamente EADDRINUSE); llega asíncrono, por eso es un callback. */
  onError?: (err: NodeJS.ErrnoException) => void;
}

export interface ApiHandle {
  close(): void;
  /** Resuelve cuando el server ya escucha. */
  listening: Promise<void>;
  address(): AddressInfo | string | null;
}

/**
 * Levanta la API. La usan las dos vías: `dev:server` (proceso Node aparte) y el main de Electron,
 * que la corre embebida — un proceso hijo no evitaría nada, porque también correría el runtime de
 * Electron y necesitaría la misma ABI para los módulos nativos.
 */
export function startApi(options: ApiOptions): ApiHandle {
  const port = options.port ?? SERVER_PORT;
  const db = openDatabase(options.driver, options.dbPath);
  const host = options.host ?? SERVER_HOST;
  // Con host explícito: sin él Node escucha en TODAS las interfaces y la API quedaba expuesta a la LAN.
  const server: Server = createApp(db, options.jwtSecret).listen(port, host, () => {
    console.log(`[server] GameClip API escuchando en http://${host}:${port}`);
  });
  const listening = new Promise<void>((resolve) => server.once('listening', () => resolve()));
  server.on('error', (err: NodeJS.ErrnoException) => options.onError?.(err));

  return {
    close(): void {
      server.close();
      db.close();
    },
    listening,
    address: () => server.address(),
  };
}
