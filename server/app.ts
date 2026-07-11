import cors from 'cors';
import express, { type Express } from 'express';
import { AuthService } from './auth/auth.service';
import type { AppDatabase } from './db/database';
import { MetaRepository } from './db/meta.repository';
import { authRouter } from './routes/auth';
import { healthRouter } from './routes/health';
import packageJson from '../package.json';

// App exportable sin listen() para poder testearla con supertest.
export function createApp(db: AppDatabase): Express {
  const app = express();
  // API local sin cookies (tokens por header Authorization): origen abierto sin riesgo.
  app.use(cors());
  app.use(express.json());

  const meta = new MetaRepository(db);
  const auth = new AuthService(db);
  app.use('/api', healthRouter(meta, packageJson.version));
  app.use('/api', authRouter(auth));

  return app;
}
