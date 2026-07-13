import { describe, expect, it } from 'vitest';
import { compareVersions, isNewer } from '../version';

describe('compareVersions', () => {
  it('ordena por componente numérico, no alfabético', () => {
    // El bug clásico del string: "0.5.10" < "0.5.2" alfabéticamente, pero 10 > 2.
    const ordenadas = ['0.5.2', '0.6.0', '0.5.10', '0.5.1'].sort(compareVersions);
    expect(ordenadas).toEqual(['0.5.1', '0.5.2', '0.5.10', '0.6.0']);
  });

  it('iguales dan 0', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('ignora la v inicial', () => {
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0);
  });

  it('rellena componentes faltantes con 0', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('2', '1.9.9')).toBeGreaterThan(0);
  });

  it('ignora sufijos tras el patch', () => {
    expect(compareVersions('1.2.3-rc1', '1.2.3')).toBe(0);
  });
});

describe('isNewer', () => {
  it('true solo si latest > current', () => {
    expect(isNewer('0.6.0', '0.5.1')).toBe(true);
    expect(isNewer('0.5.10', '0.5.2')).toBe(true);
  });

  it('igual o anterior → false', () => {
    expect(isNewer('0.5.1', '0.5.1')).toBe(false);
    expect(isNewer('0.5.0', '0.5.1')).toBe(false);
  });
});
