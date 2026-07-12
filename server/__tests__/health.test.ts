import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import Database from 'better-sqlite3';
import { SCHEMA_VERSION, openDatabase } from '../db/database';

const db = openDatabase(Database, ':memory:');
const app = createApp(db);

afterAll(() => db.close());

describe('GET /api/health', () => {
  it('responde 200 con estado, versión y versión de esquema', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
      schemaVersion: String(SCHEMA_VERSION),
    });
  });

  it('devuelve 404 en rutas desconocidas', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
  });
});
