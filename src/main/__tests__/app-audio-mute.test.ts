import { describe, expect, it, vi } from 'vitest';
import {
  buildArgs,
  HapticMuteListener,
  type HapticMuteDeps,
  type SpawnedProcess,
} from '../capture/app-audio-mute';

/** Proceso falso: registra kill() y expone el listener de 'exit' para simular muerte del proceso. */
function fakeProcess() {
  const proc = {
    killed: 0,
    exitListener: null as null | (() => void),
    kill: vi.fn(() => {
      proc.killed++;
    }),
    on: vi.fn((_event: 'exit', listener: () => void) => {
      proc.exitListener = listener;
    }),
  };
  return proc;
}

function makeDeps(overrides: Partial<HapticMuteDeps> = {}) {
  const spawned: ReturnType<typeof fakeProcess>[] = [];
  const deps: HapticMuteDeps = {
    helperPath: () => 'C:\\fake\\gc-app-audio-mute.exe',
    spawn: vi.fn((): SpawnedProcess => {
      const p = fakeProcess();
      spawned.push(p);
      return p;
    }),
    ...overrides,
  };
  return { deps, spawned };
}

describe('buildArgs', () => {
  it('arma la CLI de watch con proceso por defecto obs64.exe', () => {
    expect(buildArgs('DualSense')).toEqual([
      '--device',
      'DualSense',
      '--process',
      'obs64.exe',
      '--watch',
    ]);
  });
});

describe('HapticMuteListener', () => {
  it('apply(true) lanza el listener con los args de watch', () => {
    const { deps } = makeDeps();
    const listener = new HapticMuteListener(deps);
    listener.apply(true, 'DualSense');
    expect(deps.spawn).toHaveBeenCalledTimes(1);
    expect(deps.spawn).toHaveBeenCalledWith(
      'C:\\fake\\gc-app-audio-mute.exe',
      buildArgs('DualSense'),
    );
  });

  it('apply repetido con el mismo estado no relanza (idempotente)', () => {
    const { deps } = makeDeps();
    const listener = new HapticMuteListener(deps);
    listener.apply(true, 'DualSense');
    listener.apply(true, 'DualSense');
    listener.apply(true, '  DualSense  '); // el trim lo normaliza al mismo patrón
    expect(deps.spawn).toHaveBeenCalledTimes(1);
  });

  it('cambiar el patrón reinicia el proceso (mata el viejo, lanza uno nuevo)', () => {
    const { deps, spawned } = makeDeps();
    const listener = new HapticMuteListener(deps);
    listener.apply(true, 'DualSense');
    listener.apply(true, 'Wireless Controller');
    expect(deps.spawn).toHaveBeenCalledTimes(2);
    expect(spawned[0].killed).toBe(1); // el primero se mató
    expect(deps.spawn).toHaveBeenLastCalledWith(
      'C:\\fake\\gc-app-audio-mute.exe',
      buildArgs('Wireless Controller'),
    );
  });

  it('apply(false) mata el proceso; y no relanza mientras siga desactivado', () => {
    const { deps, spawned } = makeDeps();
    const listener = new HapticMuteListener(deps);
    listener.apply(true, 'DualSense');
    listener.apply(false, 'DualSense');
    expect(spawned[0].killed).toBe(1);
    listener.apply(false, 'DualSense');
    expect(deps.spawn).toHaveBeenCalledTimes(1);
  });

  it('patrón vacío equivale a desactivado: no lanza nada', () => {
    const { deps } = makeDeps();
    const listener = new HapticMuteListener(deps);
    listener.apply(true, '   ');
    expect(deps.spawn).not.toHaveBeenCalled();
  });

  it('sin binario (helperPath null) es no-op', () => {
    const { deps } = makeDeps({ helperPath: () => null });
    const listener = new HapticMuteListener(deps);
    listener.apply(true, 'DualSense');
    expect(deps.spawn).not.toHaveBeenCalled();
  });

  it('stop() mata el proceso vivo', () => {
    const { deps, spawned } = makeDeps();
    const listener = new HapticMuteListener(deps);
    listener.apply(true, 'DualSense');
    listener.stop();
    expect(spawned[0].killed).toBe(1);
  });

  it('si el proceso muere solo, un apply posterior lo relanza', () => {
    const { deps, spawned } = makeDeps();
    const listener = new HapticMuteListener(deps);
    listener.apply(true, 'DualSense');
    spawned[0].exitListener?.(); // el helper murió por su cuenta
    listener.apply(true, 'DualSense');
    expect(deps.spawn).toHaveBeenCalledTimes(2);
  });
});
