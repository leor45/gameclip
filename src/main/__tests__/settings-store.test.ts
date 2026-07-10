import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

  it('normaliza valores inválidos al guardar', () => {
    const store = new SettingsStore(join(dir, 'invalidos.json'));
    const saved = store.save({ replaySeconds: 99999 } as never);
    expect(saved.replaySeconds).toBeLessThanOrEqual(300);
  });
});
