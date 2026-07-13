import { describe, expect, it, vi } from 'vitest';
import {
  applyHapticMute,
  buildArgs,
  type HapticMuteDeps,
} from '../capture/app-audio-mute';

/**
 * Deps de test con reloj simulado: `now` avanza cada vez que se llama a `wait`, así el bucle de
 * reintento termina sin temporizadores reales. `run` devuelve los códigos de `codes` en orden (el
 * último se repite), o lanza si el elemento es 'throw'.
 */
function makeDeps(
  codes: (number | 'throw')[],
  overrides: Partial<HapticMuteDeps> = {},
): HapticMuteDeps {
  let clock = 0;
  let i = 0;
  return {
    helperPath: () => 'C:\\fake\\gc-app-audio-mute.exe',
    run: vi.fn(async () => {
      const code = codes[Math.min(i++, codes.length - 1)];
      if (code === 'throw') throw new Error('spawn falló');
      return code;
    }),
    wait: vi.fn(async (ms: number) => {
      clock += ms;
    }),
    now: () => clock,
    ...overrides,
  };
}

describe('buildArgs', () => {
  it('arma la CLI con proceso por defecto obs64.exe y --mute', () => {
    expect(buildArgs('DualSense')).toEqual([
      '--device',
      'DualSense',
      '--process',
      'obs64.exe',
      '--mute',
    ]);
  });

  it('acepta un proceso explícito', () => {
    expect(buildArgs('Wireless Controller', 'otro.exe')).toEqual([
      '--device',
      'Wireless Controller',
      '--process',
      'otro.exe',
      '--mute',
    ]);
  });
});

describe('applyHapticMute', () => {
  it('aplica al primer intento cuando el helper devuelve 0', async () => {
    const deps = makeDeps([0]);
    await expect(applyHapticMute('DualSense', deps)).resolves.toBe('applied');
    expect(deps.run).toHaveBeenCalledTimes(1);
    expect(deps.run).toHaveBeenCalledWith('C:\\fake\\gc-app-audio-mute.exe', buildArgs('DualSense'));
    expect(deps.wait).not.toHaveBeenCalled();
  });

  it('no-op si no hay binario (helperPath null)', async () => {
    const deps = makeDeps([0], { helperPath: () => null });
    await expect(applyHapticMute('DualSense', deps)).resolves.toBe('skipped');
    expect(deps.run).not.toHaveBeenCalled();
  });

  it('no-op si el patrón está vacío o en blanco', async () => {
    const deps = makeDeps([0]);
    await expect(applyHapticMute('   ', deps)).resolves.toBe('skipped');
    expect(deps.run).not.toHaveBeenCalled();
  });

  it('reintenta mientras no encuentra la sesión (código 3) y para al obtener 0', async () => {
    const deps = makeDeps([3, 3, 0]);
    await expect(applyHapticMute('DualSense', deps)).resolves.toBe('applied');
    expect(deps.run).toHaveBeenCalledTimes(3);
    expect(deps.wait).toHaveBeenCalledTimes(2);
  });

  it('se rinde con timeout si la sesión nunca aparece, sin lanzar', async () => {
    const deps = makeDeps([3]);
    await expect(applyHapticMute('DualSense', deps)).resolves.toBe('timeout');
    // 3000 ms / 250 ms → 13 intentos, 12 esperas.
    expect(deps.run).toHaveBeenCalledTimes(13);
    expect(deps.wait).toHaveBeenCalledTimes(12);
  });

  it('un fallo de ejecución (throw) se trata como reintentable y no propaga', async () => {
    const deps = makeDeps(['throw', 'throw', 0]);
    await expect(applyHapticMute('DualSense', deps)).resolves.toBe('applied');
    expect(deps.run).toHaveBeenCalledTimes(3);
  });
});
