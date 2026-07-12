// Entrypoint de `npm run dev:server`: la API como proceso Node aparte, con el binario de
// better-sqlite3 de ABI de Node. Empaquetada, la API la arranca el main con el alias de Electron.
import Database from 'better-sqlite3';
import { startApi } from './api';
import { DEFAULT_DB_PATH } from './db/database';

startApi({
  driver: Database,
  dbPath: DEFAULT_DB_PATH,
  onError: (err) => {
    console.error('[server] no se pudo escuchar:', err.message);
    process.exit(1);
  },
});
