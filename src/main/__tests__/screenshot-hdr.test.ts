import { describe, expect, it } from 'vitest';
import { debeRelanzarPorHdr } from '../capture/screenshot-hdr';

describe('debeRelanzarPorHdr', () => {
  it('sin cambio de valor no relanza (guardar otros ajustes no debe reiniciar la app)', () => {
    expect(debeRelanzarPorHdr(false, false, 'idle')).toBe(false);
    expect(debeRelanzarPorHdr(true, true, 'buffering')).toBe(false);
  });

  it('con una grabación en curso no relanza: se perdería la grabación', () => {
    expect(debeRelanzarPorHdr(false, true, 'recording')).toBe(false);
    expect(debeRelanzarPorHdr(true, false, 'recording')).toBe(false);
  });

  // 'buffering' es el estado normal con bufferMode 'always': exigir 'idle' sería no relanzar nunca.
  it('relanza al cambiar el valor en cualquier otro estado', () => {
    expect(debeRelanzarPorHdr(false, true, 'buffering')).toBe(true);
    expect(debeRelanzarPorHdr(false, true, 'idle')).toBe(true);
    expect(debeRelanzarPorHdr(true, false, 'unavailable')).toBe(true);
    expect(debeRelanzarPorHdr(false, true, 'initializing')).toBe(true);
  });
});
