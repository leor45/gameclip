import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CAPTURE_SETTINGS,
  REPLAY_SECONDS_MAX,
  REPLAY_SECONDS_MIN,
  normalizeCaptureSettings,
} from '../capture';

describe('normalizeCaptureSettings', () => {
  it('devuelve defaults ante entrada nula o basura', () => {
    expect(normalizeCaptureSettings(null)).toEqual(DEFAULT_CAPTURE_SETTINGS);
    expect(normalizeCaptureSettings('basura')).toEqual(DEFAULT_CAPTURE_SETTINGS);
    expect(normalizeCaptureSettings(42)).toEqual(DEFAULT_CAPTURE_SETTINGS);
  });

  it('conserva valores válidos', () => {
    const entrada = {
      resolution: '720p',
      fps: 30,
      quality: 'lossless',
      encoderId: 'jim_nvenc',
      replaySeconds: 120,
      micEnabled: false,
      replayHotkey: 'F9',
      outputDir: 'D:\\clips',
      bufferMode: 'game',
      overlayEnabled: false,
      autoLaunch: true,
    };
    // Los campos no enviados caen a sus defaults.
    expect(normalizeCaptureSettings(entrada)).toEqual({
      ...DEFAULT_CAPTURE_SETTINGS,
      ...entrada,
    });
  });

  it('corrige campo a campo los valores inválidos', () => {
    const result = normalizeCaptureSettings({
      resolution: '4k',
      fps: 59,
      quality: 'ultra',
      encoderId: 7,
      replaySeconds: 'mucho',
      micEnabled: 'sí',
      replayHotkey: '   ',
      outputDir: null,
    });
    expect(result).toEqual(DEFAULT_CAPTURE_SETTINGS);
  });

  it('normaliza los ajustes de comportamiento (Fase 6) con sus defaults', () => {
    // Defaults: comportamiento previo a la Fase 6 (buffer siempre, overlay sí, autostart no).
    const defaults = normalizeCaptureSettings({});
    expect(defaults.bufferMode).toBe('always');
    expect(defaults.overlayEnabled).toBe(true);
    expect(defaults.autoLaunch).toBe(false);

    expect(normalizeCaptureSettings({ bufferMode: 'game' }).bufferMode).toBe('game');
    expect(normalizeCaptureSettings({ bufferMode: 'auto' }).bufferMode).toBe('always');
    expect(normalizeCaptureSettings({ overlayEnabled: 'no' }).overlayEnabled).toBe(true);
    expect(normalizeCaptureSettings({ autoLaunch: 1 }).autoLaunch).toBe(false);
  });

  it('audioApps guardados sin `enabled` migran a enabled: true', () => {
    const result = normalizeCaptureSettings({
      audioApps: [
        { executable: 'Discord.exe', volume: 80 },
        { executable: 'Spotify.exe', volume: 50, enabled: false },
      ],
    });
    expect(result.audioApps).toEqual([
      { executable: 'Discord.exe', volume: 80, enabled: true },
      { executable: 'Spotify.exe', volume: 50, enabled: false },
    ]);
  });

  it('normaliza PTT, supresión de ruido y aceleración por hardware', () => {
    const defaults = normalizeCaptureSettings({});
    expect(defaults.pttEnabled).toBe(false);
    expect(defaults.pttHotkey).toBe('F9');
    expect(defaults.noiseSuppressionEnabled).toBe(false);
    expect(defaults.hardwareAcceleration).toBe(true);

    expect(normalizeCaptureSettings({ pttHotkey: 'Mouse4' }).pttHotkey).toBe('Mouse4');
    // Tecla fuera de la lista blanca: cae al default.
    expect(normalizeCaptureSettings({ pttHotkey: 'Escape' }).pttHotkey).toBe('F9');
    expect(normalizeCaptureSettings({ hardwareAcceleration: 'no' }).hardwareAcceleration).toBe(
      true,
    );
  });

  it('acota replaySeconds al rango permitido y lo redondea', () => {
    expect(normalizeCaptureSettings({ replaySeconds: 1 }).replaySeconds).toBe(REPLAY_SECONDS_MIN);
    expect(normalizeCaptureSettings({ replaySeconds: 9999 }).replaySeconds).toBe(
      REPLAY_SECONDS_MAX,
    );
    expect(normalizeCaptureSettings({ replaySeconds: 45.6 }).replaySeconds).toBe(46);
  });
});
