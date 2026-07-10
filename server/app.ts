import express, { type Express } from 'express';
import type { AppDatabase } from './db/database';
import { MetaRepository } from './db/meta.repository';
import { healthRouter } from './routes/health';
import packageJson from '../package.json';

// App exportable sin listen() para poder testearla con supertest.
export function createApp(db: AppDatabase): Express {
  const app = express();
  app.use(express.json());

  const meta = new MetaRepository(db);
  app.use('/api', healthRouter(meta, packageJson.version));

  return app;
}
