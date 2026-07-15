import { describe, expect, it, vi } from 'vitest';
import {
  effectiveGain,
  LivePreviewAudio,
  RESYNC_THRESHOLD_SECONDS,
  shouldResync,
} from '../lib/live-audio';

describe('shouldResync', () => {
  it('false dentro del umbral, true fuera', () => {
    expect(shouldResync(10, 10.1)).toBe(false);
    expect(shouldResync(10, 10 + RESYNC_THRESHOLD_SECONDS + 0.01)).toBe(true);
    expect(shouldResync(10, 9.5)).toBe(true);
  });

  it('un tiempo no finito (audio no sonando) nunca pide re-sync', () => {
    expect(shouldResync(Number.NaN, 10)).toBe(false);
    expect(shouldResync(10, Number.NaN)).toBe(false);
  });
});

describe('effectiveGain', () => {
  it('eliminada ⇒ 0; si no, la ganancia acotada a [0, 2]', () => {
    expect(effectiveGain(1.5, false)).toBe(1.5);
    expect(effectiveGain(1.5, true)).toBe(0);
    expect(effectiveGain(5, false)).toBe(2); // se acota
    expect(effectiveGain(-1, false)).toBe(0);
  });
});

// En jsdom no existe AudioContext: el motor debe ser un no-op silencioso y no romper el editor.
describe('LivePreviewAudio sin AudioContext (jsdom)', () => {
  it('queda deshabilitado y ningún método lanza', async () => {
    const engine = new LivePreviewAudio();
    expect(engine.enabled).toBe(false);

    const fetchBytes = vi.fn().mockResolvedValue(new ArrayBuffer(0));
    await expect(engine.load(['game', 'mic'], fetchBytes)).resolves.toBeUndefined();
    // Sin motor real no se pide nada al main.
    expect(fetchBytes).not.toHaveBeenCalled();

    expect(() => {
      engine.setGain('game', 1.5);
      engine.play(0);
      engine.seek(3);
      engine.stop();
      engine.dispose();
    }).not.toThrow();
    expect(engine.audioTime()).toBeNaN();
  });
});
