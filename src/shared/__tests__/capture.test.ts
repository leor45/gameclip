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
    };
    expect(normalizeCaptureSettings(entrada)).toEqual(entrada);
  });

  it('corrige campo a campo los valores inválidos', () => {
    const result = normalizeCaptureSettings({
      resolution: '4k',
      fps: 144,
      quality: 'ultra',
      encoderId: 7,
      replaySeconds: 'mucho',
      micEnabled: 'sí',
      replayHotkey: '   ',
      outputDir: null,
    });
    expect(result).toEqual(DEFAULT_CAPTURE_SETTINGS);
  });

  it('acota replaySeconds al rango permitido y lo redondea', () => {
    expect(normalizeCaptureSettings({ replaySeconds: 1 }).replaySeconds).toBe(REPLAY_SECONDS_MIN);
    expect(normalizeCaptureSettings({ replaySeconds: 9999 }).replaySeconds).toBe(
      REPLAY_SECONDS_MAX,
    );
    expect(normalizeCaptureSettings({ replaySeconds: 45.6 }).replaySeconds).toBe(46);
  });
});
