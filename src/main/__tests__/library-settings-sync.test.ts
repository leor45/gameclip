import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureState, CaptureStatus } from '@shared/capture';
import { ClipsRepository } from '../library/clips-repository';
import { LibraryManager } from '../library/manager';
import { syncLibraryAfterSettings } from '../library/settings-sync';

function status(state: CaptureState): CaptureStatus {
  return { state, error: null, lastClipPath: null, detectedGame: null };
}

function fakes(state: CaptureState) {
  const library = {
    reconcile: vi.fn(() => ({ added: 0, removed: 0 })),
    relabelGames: vi.fn(() => 0),
  };
  const capture = { outputDir: vi.fn(() => 'D:\\Clips'), getStatus: vi.fn(() => status(state)) };
  const aplicarLimite = vi.fn();
  return { library, capture, aplicarLimite };
}

afterEach(() => vi.restoreAllMocks());

describe('syncLibraryAfterSettings — al guardar los ajustes', () => {
  it.each<CaptureState>(['idle', 'buffering', 'initializing', 'unavailable'])(
    'sin grabación (%s) escanea, re-etiqueta y aplica el límite, en ese orden',
    (state) => {
      const deps = fakes(state);
      const orden: string[] = [];
      deps.library.reconcile.mockImplementation(
        () => (orden.push('reconcile'), { added: 0, removed: 0 }),
      );
      deps.library.relabelGames.mockImplementation(() => (orden.push('relabel'), 0));
      deps.aplicarLimite.mockImplementation(() => orden.push('limite'));

      syncLibraryAfterSettings(deps);

      expect(orden).toEqual(['reconcile', 'relabel', 'limite']);
      expect(deps.library.reconcile).toHaveBeenCalledWith('D:\\Clips');
      expect(deps.library.relabelGames).toHaveBeenCalledWith('D:\\Clips');
    },
  );

  it('regresión D5-BUG-2: grabando NO escanea (el MP4 en curso está a medias en la raíz)', () => {
    const deps = fakes('recording');

    syncLibraryAfterSettings(deps);

    expect(deps.library.reconcile).not.toHaveBeenCalled();
    // Lo demás sigue: re-etiquetar solo toca filas ya catalogadas y el límite solo borra clips del
    // catálogo — la grabación en curso no está en él.
    expect(deps.library.relabelGames).toHaveBeenCalledWith('D:\\Clips');
    expect(deps.aplicarLimite).toHaveBeenCalledOnce();
  });

  it('regresión D5-BUG-1: un escaneo que lanza no sale del listener y el resto de pasos corre', () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = fakes('buffering');
    deps.library.reconcile.mockImplementation(() => {
      throw Object.assign(new Error("EPERM: scandir 'E:\\System Volume Information'"), {
        code: 'EPERM',
      });
    });

    expect(() => syncLibraryAfterSettings(deps)).not.toThrow();

    expect(deps.library.relabelGames).toHaveBeenCalledOnce();
    expect(deps.aplicarLimite).toHaveBeenCalledOnce();
    expect(errores).toHaveBeenCalled();
  });

  it('ningún paso puede abortar el guardado: re-etiquetar o el límite que lanzan tampoco salen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = fakes('idle');
    deps.library.relabelGames.mockImplementation(() => {
      throw new Error('SQLITE_BUSY');
    });
    deps.aplicarLimite.mockImplementation(() => {
      throw new Error('ajustes ilegibles');
    });

    expect(() => syncLibraryAfterSettings(deps)).not.toThrow();
    expect(deps.aplicarLimite).toHaveBeenCalledOnce();
  });

  it('ni siquiera si falla leer la carpeta de salida', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = fakes('idle');
    deps.capture.outputDir.mockImplementation(() => {
      throw new Error('ajustes ilegibles');
    });

    expect(() => syncLibraryAfterSettings(deps)).not.toThrow();
  });
});

describe('syncLibraryAfterSettings — integración con el catálogo real (regresión D5-BUG-2)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gameclip-settings-sync-'));
  const outputDir = join(dir, 'salida');
  const db = new Database(':memory:');
  const repo = new ClipsRepository(db);

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    db.exec('DELETE FROM clips;');
    rmSync(outputDir, { recursive: true, force: true });
    mkdirSync(outputDir, { recursive: true });
  });

  it('guardar ajustes durante una grabación no deja una fila fantasma del MP4 a medio escribir', async () => {
    const library = new LibraryManager(repo, { thumbnailsDir: join(dir, 'thumbs') });
    let estado: CaptureState = 'recording';
    const capture = { outputDir: () => outputDir, getStatus: () => status(estado) };
    const aplicarLimite = vi.fn();

    // libobs escribe la grabación en la RAÍZ de la carpeta mientras dura.
    const enCurso = join(outputDir, '2026-10-09 21-00-00.mp4');
    writeFileSync(enCurso, 'medio-video');
    // El owner toca un ajuste (basta el atajo del overlay de rendimiento).
    syncLibraryAfterSettings({ library, capture, aplicarLimite });

    // Al parar, la captura mueve el archivo a `<Juego>/` y lo registra como grabación.
    mkdirSync(join(outputDir, 'Terraria'));
    const final = join(outputDir, 'Terraria', 'Terraria 2026.10.09 - 21.00.00.00.mp4');
    renameSync(enCurso, final);
    writeFileSync(final, 'video-completo-y-mas-largo');
    estado = 'buffering';
    await library.registerSavedClip(final, 'recording', 'Terraria');

    const clips = library.list();
    expect(clips).toHaveLength(1);
    expect(clips[0].source).toBe('recording');
    expect(clips[0].filePath).toBe(final);
    expect(clips[0].sizeBytes).toBe('video-completo-y-mas-largo'.length);

    // Y un guardado ya sin grabación escanea con normalidad (no deja nada nuevo que añadir).
    syncLibraryAfterSettings({ library, capture, aplicarLimite });
    expect(library.list()).toHaveLength(1);
  });
});
