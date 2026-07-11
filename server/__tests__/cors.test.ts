import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { openDatabase } from '../db/database';

// Regresión: el renderer en dev (http://localhost:5173) quedaba bloqueado por CORS
// porque el server no respondía el preflight ni enviaba Access-Control-Allow-Origin.
const db = openDatabase(':memory:');
const app = createApp(db);

afterAll(() => db.close());

describe('CORS', () => {
  it('responde el preflight OPTIONS con las cabeceras CORS', async () => {
    const res = await request(app)
      .options('/api/auth/register')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization');

    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
    expect(res.headers['access-control-allow-headers']).toMatch(/authorization/i);
  });

  it('incluye Access-Control-Allow-Origin en respuestas normales', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });
});
