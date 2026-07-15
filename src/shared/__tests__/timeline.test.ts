import { describe, expect, it } from 'vitest';
import {
  clampTime,
  clampZoomFactor,
  MIN_TRIM_SECONDS,
  pxToSeconds,
  secondsToPx,
  setTrackVolume,
  setTrimEnd,
  setTrimStart,
  timelinePxPerSecond,
  wheelToGain,
  ZOOM_FACTOR_MAX,
  ZOOM_FACTOR_MIN,
} from '../timeline';

describe('conversión tiempo↔px y zoom', () => {
  it('convierte segundos a px y de vuelta', () => {
    expect(secondsToPx(3, 24)).toBe(72);
    expect(pxToSeconds(72, 24)).toBe(3);
    expect(pxToSeconds(50, 0)).toBe(0); // sin dividir por cero
  });

  it('acota el factor de zoom a su rango (mínimo 1× = fit)', () => {
    expect(clampZoomFactor(0.2)).toBe(ZOOM_FACTOR_MIN);
    expect(clampZoomFactor(9999)).toBe(ZOOM_FACTOR_MAX);
    expect(clampZoomFactor(NaN)).toBe(ZOOM_FACTOR_MIN);
    expect(clampZoomFactor(3)).toBe(3);
  });

  it('clampTime acota a [0, duration]', () => {
    expect(clampTime(-5, 10)).toBe(0);
    expect(clampTime(50, 10)).toBe(10);
    expect(clampTime(4, 10)).toBe(4);
  });

  it('px/segundo = fit × factor; a 1× llena el ancho, a 2× el doble', () => {
    // 28 s en 1264 px, factor 1 → llena el ancho exacto.
    expect(timelinePxPerSecond(1, 1264, 28)).toBeCloseTo(1264 / 28);
    // Factor 2 → el doble (scroll).
    expect(timelinePxPerSecond(2, 1264, 28)).toBeCloseTo((1264 / 28) * 2);
    // Factor por debajo de 1 se acota a 1 (no se puede alejar más que el fit).
    expect(timelinePxPerSecond(0.3, 1264, 28)).toBeCloseTo(1264 / 28);
    // Sin ancho medido aún, usa el px/s de reserva.
    expect(timelinePxPerSecond(1, 0, 28)).toBe(24);
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
