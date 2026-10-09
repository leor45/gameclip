import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { startApi } from '../api';
import { createApp } from '../app';
import { loadOrCreateSecret } from '../auth/jwt-secret';
import { openDatabase } from '../db/database';

// Regresión de seguridad (auditoría 2026-10-08): la API escuchaba en todas las interfaces y firmaba con
// un secreto público ('gameclip-dev-secret'): desde la LAN se podían falsificar tokens.

const dir = mkdtempSync(join(tmpdir(), 'gameclip-api-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('startApi', () => {
  it('escucha solo en 127.0.0.1', async () => {
    const api = startApi({
      driver: Database,
      dbPath: ':memory:',
      port: 0,
      jwtSecret: 'secreto-de-test',
    });
    try {
      await api.listening;
      expect((api.address() as AddressInfo).address).toBe('127.0.0.1');
    } finally {
      api.close();
    }
  });
});

describe('secreto JWT inyectado', () => {
  const db = openDatabase(Database, ':memory:');
  const app = createApp(db, 'secreto-propio-de-esta-instalacion');
  afterAll(() => db.close());

  it('un token firmado con el secreto público de desarrollo no vale', async () => {
    const falsificado = jwt.sign({}, 'gameclip-dev-secret', { subject: '1', expiresIn: '15m' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${falsificado}`);
    expect(res.status).toBe(401);
  });

  it('los tokens que emite la propia API sí valen', async () => {
    const registro = await request(app)
      .post('/api/auth/register')
      .send({ email: 'leo@gameclip.test', password: 'contraseña-segura', displayName: 'Leo' });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${registro.body.tokens.accessToken}`);
    expect(res.status).toBe(200);
  });
});

describe('loadOrCreateSecret', () => {
  it('crea un secreto aleatorio la primera vez y lo reutiliza después', () => {
    const fichero = join(dir, 'api-secret');
    const primero = loadOrCreateSecret(fichero);
    expect(primero).toMatch(/^[0-9a-f]{96}$/);
    expect(readFileSync(fichero, 'utf8').trim()).toBe(primero);
    expect(loadOrCreateSecret(fichero)).toBe(primero);
  });

  it('regenera si el fichero está vacío', () => {
    const fichero = join(dir, 'vacio');
    writeFileSync(fichero, '  \n');
    expect(loadOrCreateSecret(fichero)).toMatch(/^[0-9a-f]{96}$/);
  });
});
