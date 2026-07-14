import { describe, expect, it } from 'vitest';
import {
  clampTime,
  clampZoom,
  effectivePxPerSecond,
  MIN_TRIM_SECONDS,
  pxToSeconds,
  secondsToPx,
  setTrackVolume,
  setTrimEnd,
  setTrimStart,
  wheelToGain,
  ZOOM_MAX,
  ZOOM_MIN,
} from '../timeline';

describe('conversión tiempo↔px y zoom', () => {
  it('convierte segundos a px y de vuelta', () => {
    expect(secondsToPx(3, 24)).toBe(72);
    expect(pxToSeconds(72, 24)).toBe(3);
    expect(pxToSeconds(50, 0)).toBe(0); // sin dividir por cero
  });

  it('acota el zoom a su rango', () => {
    expect(clampZoom(1)).toBe(ZOOM_MIN);
    expect(clampZoom(9999)).toBe(ZOOM_MAX);
    expect(clampZoom(NaN)).toBeGreaterThan(0);
  });

  it('clampTime acota a [0, duration]', () => {
    expect(clampTime(-5, 10)).toBe(0);
    expect(clampTime(50, 10)).toBe(10);
    expect(clampTime(4, 10)).toBe(4);
  });

  it('escala efectiva: clip corto se ajusta al ancho; largo respeta el zoom', () => {
    // Clip de 28 s en 1264 px: el fit (45,1) supera al zoom (24) → llena el ancho.
    expect(effectivePxPerSecond(24, 1264, 28)).toBeCloseTo(1264 / 28);
    // Clip de 300 s en 1264 px: el fit (4,2) es menor que el zoom → se usa el zoom (scroll).
    expect(effectivePxPerSecond(24, 1264, 300)).toBe(24);
    // Sin ancho medido aún, cae al zoom.
    expect(effectivePxPerSecond(24, 0, 28)).toBe(24);
  });
});

describe('recorte', () => {
  const trim = { start: 2, end: 8 };

  it('mover el inicio no cruza el fin (deja el mínimo)', () => {
    expect(setTrimStart(trim, 5, 10).start).toBe(5);
    expect(setTrimStart(trim, 9, 10).start).toBe(8 - MIN_TRIM_SECONDS);
    expect(setTrimStart(trim, -3, 10).start).toBe(0);
  });

  it('mover el fin no cruza el inicio ni pasa la duración', () => {
    expect(setTrimEnd(trim, 6, 10).end).toBe(6);
    expect(setTrimEnd(trim, 1, 10).end).toBe(2 + MIN_TRIM_SECONDS);
    expect(setTrimEnd(trim, 50, 10).end).toBe(10);
  });
});

describe('volumen por pista', () => {
  it('fija el volumen acotado, devolviendo un mapa nuevo', () => {
    const v = setTrackVolume({ game: 1 }, 'mic', 1.5);
    expect(v).toEqual({ game: 1, mic: 1.5 });
    expect(setTrackVolume({}, 'mic', 9).mic).toBe(2); // acotado
  });

  it('la rueda sube/baja y se acota a [0, 2]', () => {
    expect(wheelToGain(1, -100)).toBeCloseTo(1.05); // rueda arriba
    expect(wheelToGain(1, 100)).toBeCloseTo(0.95); // rueda abajo
    expect(wheelToGain(2, -100)).toBe(2); // no pasa de 2
    expect(wheelToGain(0, 100)).toBe(0); // no baja de 0
  });
});
