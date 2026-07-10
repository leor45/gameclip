import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { openDatabase } from '../db/database';

const db = openDatabase(':memory:');
const app = createApp(db);

const usuario = {
  email: 'leo@gameclip.test',
  password: 'contraseña-segura',
  displayName: 'Leo',
};

afterAll(() => db.close());

beforeEach(() => {
  db.exec('DELETE FROM refresh_tokens; DELETE FROM users;');
});

async function registrar() {
  return request(app).post('/api/auth/register').send(usuario);
}

describe('POST /api/auth/register', () => {
  it('crea la cuenta y devuelve sesión completa', async () => {
    const res = await registrar();

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({
      id: expect.any(Number),
      email: usuario.email,
      displayName: usuario.displayName,
    });
    expect(res.body.tokens.accessToken).toEqual(expect.any(String));
    expect(res.body.tokens.refreshToken).toEqual(expect.any(String));
  });

  it('rechaza email inválido con 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...usuario, email: 'no-es-email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it('rechaza contraseña corta con 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...usuario, password: 'corta' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/contraseña/i);
  });

  it('rechaza email duplicado con 409 (case-insensitive)', async () => {
    await registrar();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...usuario, email: usuario.email.toUpperCase() });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  it('devuelve sesión con credenciales correctas', async () => {
    await registrar();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: usuario.email, password: usuario.password });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(usuario.email);
    expect(res.body.tokens.refreshToken).toEqual(expect.any(String));
  });

  it('responde 401 con contraseña errónea', async () => {
    await registrar();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: usuario.email, password: 'incorrecta-123' });
    expect(res.status).toBe(401);
  });

  it('responde 401 con email inexistente (mismo mensaje que contraseña errónea)', async () => {
    await registrar();
    const [a, b] = await Promise.all([
      request(app).post('/api/auth/login').send({ email: 'otro@x.test', password: 'lo-que-sea-1' }),
      request(app).post('/api/auth/login').send({ email: usuario.email, password: 'incorrecta-123' }),
    ]);
    expect(a.status).toBe(401);
    expect(a.body.error).toBe(b.body.error);
  });
});

describe('GET /api/auth/me', () => {
  it('devuelve el usuario con Bearer válido', async () => {
    const reg = await registrar();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${reg.body.tokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(usuario.email);
  });

  it('responde 401 sin token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('responde 401 con token corrupto', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer basura');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('rota el refresh token: emite sesión nueva y el token viejo deja de servir', async () => {
    const reg = await registrar();
    const oldToken = reg.body.tokens.refreshToken;

    const primera = await request(app).post('/api/auth/refresh').send({ refreshToken: oldToken });
    expect(primera.status).toBe(200);
    expect(primera.body.tokens.refreshToken).not.toBe(oldToken);

    const reuso = await request(app).post('/api/auth/refresh').send({ refreshToken: oldToken });
    expect(reuso.status).toBe(401);
  });

  it('responde 401 con un refresh token desconocido', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'inventado' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('revoca el refresh token', async () => {
    const reg = await registrar();
    const token = reg.body.tokens.refreshToken;

    const out = await request(app).post('/api/auth/logout').send({ refreshToken: token });
    expect(out.status).toBe(204);

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: token });
    expect(res.status).toBe(401);
  });
});
