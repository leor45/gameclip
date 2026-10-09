import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { AuthService } from './auth/auth.service';
import { DEV_JWT_SECRET } from './auth/jwt-secret';
import type { AppDatabase } from './db/database';
import { MetaRepository } from './db/meta.repository';
import { authRouter } from './routes/auth';
import { healthRouter } from './routes/health';
import packageJson from '../package.json';

// Las peticiones de la API son pequeñas (email ≤ 254, refresh token de 64 caracteres): 16 kB sobra
// y acota lo que el main de Electron lee y parsea por petición (el defecto de Express es 100 kB).
const BODY_LIMIT = '16kb';

// App exportable sin listen() para poder testearla con supertest.
export function createApp(db: AppDatabase, jwtSecret: string = DEV_JWT_SECRET): Express {
  const app = express();
  // API local sin cookies (tokens por header Authorization): origen abierto sin riesgo.
  app.use(cors());
  app.use(express.json({ limit: BODY_LIMIT }));

  const meta = new MetaRepository(db);
  const auth = new AuthService(db, jwtSecret);
  app.use('/api', healthRouter(meta, packageJson.version));
  app.use('/api', authRouter(auth));

  // Siempre el último: recoge los errores de express.json() y los que lance cualquier ruta.
  app.use(apiErrorHandler);

  return app;
}

/** Status HTTP de error utilizable (entero 400-599) o `undefined`. */
function estadoDeError(valor: unknown): number | undefined {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 400 && valor < 600
    ? valor
    : undefined;
}

function respuestaDeError(err: unknown): { status: number; error: string } {
  const e: { status?: unknown; statusCode?: unknown; type?: unknown } =
    typeof err === 'object' && err !== null ? err : {};
  // Errores de express.json() (body-parser): tipos documentados.
  if (e.type === 'entity.parse.failed') {
    return { status: 400, error: 'El cuerpo de la petición no es JSON válido.' };
  }
  if (e.type === 'entity.too.large') {
    return { status: 413, error: 'El cuerpo de la petición es demasiado grande.' };
  }
  // Mismo orden que el manejador de Express: `status` y, si no sirve, `statusCode`.
  const status = estadoDeError(e.status) ?? estadoDeError(e.statusCode);
  if (status !== undefined && status < 500) {
    return { status, error: 'Petición no válida.' };
  }
  return { status: 500, error: 'Error interno.' };
}

/**
 * Manejador final de errores: responde con la forma `{ error }` del resto de la API y nunca con el
 * stack. El de Express (`finalhandler`) manda `err.stack` como HTML fuera de NODE_ENV=production, y
 * la app empaquetada no lo define: filtraba rutas absolutas con el usuario de Windows.
 */
export function apiErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    // Ya no se puede responder: el de Express solo corta la conexión, sin escribir nada.
    next(err);
    return;
  }
  const { status, error } = respuestaDeError(err);
  if (status === 500) {
    // El detalle queda en la consola local, como hacía el manejador de Express.
    console.error('[server] error no controlado:', err);
  }
  res.status(status).json({ error });
}
