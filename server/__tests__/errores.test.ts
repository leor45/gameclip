import Database from 'better-sqlite3';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiErrorHandler, createApp } from '../app';
import { AuthService } from '../auth/auth.service';
import { openDatabase } from '../db/database';

// Regresión D2-BUG-1 y D2-BUG-2 (auditoría bug-hunter D):
// - un email enorme congelaba el main de Electron (regex con retroceso cuadrático, cuerpo de 100 kB);
// - sin manejador de errores, Express respondía con `finalhandler`, que fuera de NODE_ENV=production
//   —la app empaquetada no lo define— devuelve `err.stack` en HTML: rutas absolutas con el usuario de
//   Windows y la carpeta temporal del portable.

const db = openDatabase(Database, ':memory:');
const app = createApp(db);

afterAll(() => db.close());

beforeEach(() => {
  db.exec('DELETE FROM refresh_tokens; DELETE FROM users;');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Lo que delataría un stack: marcos «at …», rutas de Windows o de node_modules.
function expectSinStack(texto: string): void {
  expect(texto).not.toMatch(/\bat\s/);
  expect(texto).not.toContain('node_modules');
  expect(texto).not.toContain('\\');
}

describe('cuerpo JSON mal formado', () => {
  it('responde 400 en JSON { error } sin stack ni rutas', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "leo@gameclip.test", ');

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: 'El cuerpo de la petición no es JSON válido.' });
    expectSinStack(res.text);
  });

  it('conserva las cabeceras CORS en la respuesta de error', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Origin', 'http://localhost:5173')
      .set('Content-Type', 'application/json')
      .send('no es json');

    expect(res.status).toBe(400);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  it('otro error 4xx de express.json() (charset no soportado) conserva su status, sin stack', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json; charset=latin1')
      .send('{"email": "leo@gameclip.test"}');

    expect(res.status).toBe(415);
    expect(res.body).toEqual({ error: 'Petición no válida.' });
    expectSinStack(res.text);
  });
});

describe('límite de tamaño del cuerpo (16 kB)', () => {
  it('un cuerpo de más de 16 kB responde 413 en JSON { error } sin stack', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'leo@gameclip.test', password: 'x'.repeat(17 * 1024) });

    expect(res.status).toBe(413);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: 'El cuerpo de la petición es demasiado grande.' });
    expectSinStack(res.text);
  });

  it('un cuerpo justo por debajo del límite se procesa con normalidad', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'leo@gameclip.test', password: 'x'.repeat(15 * 1024) });

    expect(res.status).toBe(401);
  });
});

describe('error inesperado dentro de una ruta', () => {
  it('responde 500 { error: "Error interno." } sin stack', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(AuthService.prototype, 'logout').mockImplementation(() => {
      throw new Error('fallo en C:\\Users\\Leo\\AppData\\Local\\Temp\\portable\\server.js');
    });

    const res = await request(app).post('/api/auth/logout').send({ refreshToken: 'x' });

    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: 'Error interno.' });
    expectSinStack(res.text);
    // El detalle no se pierde: queda en la consola local, como hacía el manejador de Express.
    expect(consola).toHaveBeenCalled();
  });

  it('un refreshToken que no se puede convertir a texto da 500 { error } sin stack', async () => {
    // `String({ toString: 1 })` lanza TypeError: camino real, sin mocks, que llega a `next(err)`.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Content-Type', 'application/json')
      .send('{"refreshToken": {"toString": 1}}');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Error interno.' });
    expectSinStack(res.text);
  });
});

describe('registro con email enorme', () => {
  it('rechaza con 400 un email de más de 254 caracteres aunque tenga forma válida', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: `${'a'.repeat(250)}@gameclip.test`,
        password: 'contraseña-segura',
        displayName: 'Leo',
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'El email no es válido.' });
  });
});

describe('apiErrorHandler', () => {
  function respuestaFalsa(headersSent: boolean) {
    const res = { headersSent, status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    return res;
  }

  function manejar(err: unknown, headersSent = false) {
    const res = respuestaFalsa(headersSent);
    const next = vi.fn();
    apiErrorHandler(err, {} as Request, res as unknown as Response, next as NextFunction);
    return { res, next };
  }

  it('con la respuesta ya empezada delega en Express (que solo corta la conexión)', () => {
    const err = new Error('tarde');
    const { res, next } = manejar(err, true);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it.each([
    ['un 4xx con status', 404, 'Petición no válida.', { status: 404 }],
    ['un 4xx solo con statusCode', 415, 'Petición no válida.', { statusCode: 415 }],
    ['un 5xx con status', 500, 'Error interno.', { status: 503 }],
    ['un status fuera de rango', 500, 'Error interno.', { status: 302 }],
    ['un status no entero', 500, 'Error interno.', { status: 400.5 }],
    ['un status que no es número', 500, 'Error interno.', { status: '400' }],
    ['un valor que no es objeto', 500, 'Error interno.', 'texto'],
    ['null', 500, 'Error interno.', null],
  ])('%s → %i', (_caso, status, mensaje, err) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { res, next } = manejar(err);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ error: mensaje });
  });
});
