import { describe, expect, it, vi } from 'vitest';
import {
  ControllerCaptureListener,
  type ControllerCaptureDeps,
  type SpawnedProcess,
} from '../capture/controller-capture';

/** Proceso falso: registra kill(), expone el listener de 'exit' y permite empujar líneas de stdout. */
function fakeProcess() {
  const proc = {
    killed: 0,
    exitListener: null as null | (() => void),
    lineListener: null as null | ((line: string) => void),
    kill: vi.fn(() => {
      proc.killed++;
    }),
    on: vi.fn((_event: 'exit', listener: () => void) => {
      proc.exitListener = listener;
    }),
    onLine: vi.fn((listener: (line: string) => void) => {
      proc.lineListener = listener;
    }),
    /** Simula una línea recibida por stdout del helper. */
    emit(line: string) {
      proc.lineListener?.(line);
    },
  };
  return proc;
}

function makeDeps(overrides: Partial<ControllerCaptureDeps> = {}) {
  const spawned: ReturnType<typeof fakeProcess>[] = [];
  const deps: ControllerCaptureDeps = {
    helperPath: () => 'C:\\fake\\gc-controller-listen.exe',
    spawn: vi.fn((): SpawnedProcess => {
      const p = fakeProcess();
      spawned.push(p);
      return p;
    }),
    ...overrides,
  };
  return { deps, spawned };
}

describe('ControllerCaptureListener', () => {
  it('apply(true) lanza el helper', () => {
    const { deps } = makeDeps();
    const listener = new ControllerCaptureListener(deps);
    listener.apply(true, vi.fn());
    expect(deps.spawn).toHaveBeenCalledTimes(1);
    expect(deps.spawn).toHaveBeenCalledWith('C:\\fake\\gc-controller-listen.exe');
  });

  it('apply(true) repetido no relanza (idempotente)', () => {
    const { deps } = makeDeps();
    const listener = new ControllerCaptureListener(deps);
    listener.apply(true, vi.fn());
    listener.apply(true, vi.fn());
    expect(deps.spawn).toHaveBeenCalledTimes(1);
  });

  it('una línea `capture` dispara onCapture; varias → varias veces', () => {
    const { deps, spawned } = makeDeps();
    const onCapture = vi.fn();
    const listener = new ControllerCaptureListener(deps);
    listener.apply(true, onCapture);
    spawned[0].emit('capture');
    spawned[0].emit('capture');
    expect(onCapture).toHaveBeenCalledTimes(2);
  });

  it('las líneas que no son `capture` se ignoran', () => {
    const { deps, spawned } = makeDeps();
    const onCapture = vi.fn();
    const listener = new ControllerCaptureListener(deps);
    listener.apply(true, onCapture);
    spawned[0].emit('');
    spawned[0].emit('hola');
    spawned[0].emit('captured'); // parecido pero no exacto
    expect(onCapture).not.toHaveBeenCalled();
  });

  it('usa el callback más reciente aunque no relance el proceso', () => {
    const { deps, spawned } = makeDeps();
    const primero = vi.fn();
    const segundo = vi.fn();
    const listener = new ControllerCaptureListener(deps);
    listener.apply(true, primero);
    listener.apply(true, segundo); // idempotente para el proceso, pero refresca el callback
    spawned[0].emit('capture');
    expect(primero).not.toHaveBeenCalled();
    expect(segundo).toHaveBeenCalledTimes(1);
    expect(deps.spawn).toHaveBeenCalledTimes(1);
  });

  it('apply(false) mata el proceso; y no relanza mientras siga desactivado', () => {
    const { deps, spawned } = makeDeps();
    const listener = new ControllerCaptureListener(deps);
    listener.apply(true, vi.fn());
    listener.apply(false, vi.fn());
    expect(spawned[0].killed).toBe(1);
    listener.apply(false, vi.fn());
    expect(deps.spawn).toHaveBeenCalledTimes(1);
  });

  it('sin binario (helperPath null) es no-op', () => {
    const { deps } = makeDeps({ helperPath: () => null });
    const listener = new ControllerCaptureListener(deps);
    listener.apply(true, vi.fn());
    expect(deps.spawn).not.toHaveBeenCalled();
  });

  it('stop() mata el proceso vivo', () => {
    const { deps, spawned } = makeDeps();
    const listener = new ControllerCaptureListener(deps);
    listener.apply(true, vi.fn());
    listener.stop();
    expect(spawned[0].killed).toBe(1);
  });

  it('si el proceso muere solo, un apply posterior lo relanza', () => {
    const { deps, spawned } = makeDeps();
    const listener = new ControllerCaptureListener(deps);
    listener.apply(true, vi.fn());
    spawned[0].exitListener?.(); // el helper murió por su cuenta
    listener.apply(true, vi.fn());
    expect(deps.spawn).toHaveBeenCalledTimes(2);
  });
});
