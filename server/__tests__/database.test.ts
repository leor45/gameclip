import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, openDatabase } from '../db/database';
import { MetaRepository } from '../db/meta.repository';

const dir = mkdtempSync(join(tmpdir(), 'gameclip-test-'));
const dbPath = join(dir, 'test.db');

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('openDatabase', () => {
  it('crea la base con la tabla meta y registra la versión de esquema', () => {
    const db = openDatabase(dbPath);
    const meta = new MetaRepository(db);

    expect(meta.get('schema_version')).toBe(String(SCHEMA_VERSION));
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    db.close();
  });

  it('la migración es idempotente al reabrir la misma base', () => {
    const db = openDatabase(dbPath);
    const meta = new MetaRepository(db);

    expect(meta.get('schema_version')).toBe(String(SCHEMA_VERSION));
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    db.close();
  });
});

describe('MetaRepository', () => {
  it('set sobreescribe el valor de una clave existente', () => {
    const db = openDatabase(':memory:');
    const meta = new MetaRepository(db);

    meta.set('clave', 'a');
    meta.set('clave', 'b');

    expect(meta.get('clave')).toBe('b');
    db.close();
  });

  it('get devuelve undefined para claves inexistentes', () => {
    const db = openDatabase(':memory:');
    const meta = new MetaRepository(db);

    expect(meta.get('no-existe')).toBeUndefined();
    db.close();
  });
});
