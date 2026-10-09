import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_CAPTURE_SETTINGS } from '@shared/capture';
import { SettingsStore } from '../capture/settings-store';

const dir = mkdtempSync(join(tmpdir(), 'gameclip-settings-'));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('SettingsStore', () => {
  it('devuelve defaults si el archivo no existe', () => {
    const store = new SettingsStore(join(dir, 'no-existe.json'));
    expect(store.load()).toEqual(DEFAULT_CAPTURE_SETTINGS);
  });

  it('devuelve defaults si el archivo está corrupto', () => {
    const file = join(dir, 'corrupto.json');
    writeFileSync(file, '{esto no es json', 'utf8');
    const store = new SettingsStore(file);
    expect(store.load()).toEqual(DEFAULT_CAPTURE_SETTINGS);
  });

  it('guarda un parcial y hace round-trip con otra instancia', () => {
    const file = join(dir, 'ajustes.json');
    const store = new SettingsStore(file);
    const saved = store.save({ fps: 30, replaySeconds: 90 });

    expect(saved.fps).toBe(30);
    expect(saved.replaySeconds).toBe(90);
    expect(saved.quality).toBe(DEFAULT_CAPTURE_SETTINGS.quality);

    const otra = new SettingsStore(file);
    expect(otra.load()).toEqual(saved);
  });

  it('escribe en atómico: no deja temporal y el principal parsea tras guardar', () => {
    const file = join(dir, 'atomico.json');
    const store = new SettingsStore(file);
    store.save({ fps: 30 });

    expect(existsSync(`${file}.tmp`)).toBe(false);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ fps: 30 });
  });

  it('regresión: con el principal truncado por un cierre sucio, recupera del respaldo .bak', () => {
    const file = join(dir, 'truncado.json');
    const store = new SettingsStore(file);
    store.save({ replayHotkey: 'F2', storageLimitGb: 50 }); // primer save: aún no hay .bak
    store.save({ fps: 30 }); // segundo save: el principal anterior pasa a .bak
    // Un apagón a mitad de la escritura deja el JSON a medias.
    writeFileSync(file, '{"fps": 30, "replayHot', 'utf8');

    const otra = new SettingsStore(file);
    const cargado = otra.load();

    // Antes: defaults en silencio (atajos, carpeta, exclusiones… perdidos).
    expect(cargado.replayHotkey).toBe('F2');
    expect(cargado.storageLimitGb).toBe(50);
  });

  it('un principal corrupto nunca se copia al .bak', () => {
    const file = join(dir, 'no-respaldar.json');
    const store = new SettingsStore(file);
    store.save({ fps: 30 });
    store.save({ fps: 60 }); // .bak = fps 30
    writeFileSync(file, 'basura', 'utf8');

    new SettingsStore(file).save({ replaySeconds: 20 }); // principal corrupto → no debe ir al .bak

    expect(JSON.parse(readFileSync(`${file}.bak`, 'utf8'))).toMatchObject({ fps: 30 });
  });

  it('normaliza valores inválidos al guardar', () => {
    const store = new SettingsStore(join(dir, 'invalidos.json'));
    const saved = store.save({ replaySeconds: 99999 } as never);
    expect(saved.replaySeconds).toBeLessThanOrEqual(300);
  });
});
