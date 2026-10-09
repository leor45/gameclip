// Entrypoint de `npm run dev:server`: la API como proceso Node aparte, con el binario de
// better-sqlite3 de ABI de Node. Empaquetada, la API la arranca el main con el alias de Electron.
import Database from 'better-sqlite3';
import { startApi } from './api';
import { DEV_JWT_SECRET } from './auth/jwt-secret';
import { DEFAULT_DB_PATH } from './db/database';

startApi({
  driver: Database,
  dbPath: DEFAULT_DB_PATH,
  // Desarrollo: la API solo escucha en 127.0.0.1, así que el secreto público no es alcanzable desde fuera.
  jwtSecret: process.env.GAMECLIP_JWT_SECRET ?? DEV_JWT_SECRET,
  onError: (err) => {
    console.error('[server] no se pudo escuchar:', err.message);
    process.exit(1);
  },
});
