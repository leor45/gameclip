import { Router } from 'express';
import type { MetaRepository } from '../db/meta.repository';

export function healthRouter(meta: MetaRepository, appVersion: string): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: appVersion,
      schemaVersion: meta.get('schema_version') ?? null,
    });
  });

  return router;
}
