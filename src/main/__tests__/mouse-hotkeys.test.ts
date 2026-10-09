import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalHook } from '../capture/global-hook';
import { MouseHotkeys } from '../capture/mouse-hotkeys';

class FakeHook extends EventEmitter {
  started = 0;
  stopped = 0;
  start(): void {
    this.started++;
  }
  stop(): void {
    this.stopped++;
  }
}

/** mousedown de libuiohook: botón 4 = atrás, 5 = adelante. */
function pulsar(fake: FakeHook, button: number, mods: { ctrlKey?: boolean; shiftKey?: boolean } = {}) {
  fake.emit('mousedown', {
    button,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...mods,
  });
}

describe('MouseHotkeys', () => {
  let fake: FakeHook;
  let mouse: MouseHotkeys;

  beforeEach(() => {
    fake = new FakeHook();
    mouse = new MouseHotkeys(new GlobalHook({ uIOhook: fake, UiohookKey: {} }));
  });

  it('dispara el atajo con su botón y arranca el hook al registrar', () => {
    const guardar = vi.fn();
    expect(mouse.register('Mouse4', guardar)).toBe(true);
    expect(fake.started).toBe(1);

    pulsar(fake, 4);
    expect(guardar).toHaveBeenCalledTimes(1);
    pulsar(fake, 5); // el otro lateral no
    pulsar(fake, 1); // ni el izquierdo
    expect(guardar).toHaveBeenCalledTimes(1);
  });

  it('los modificadores tienen que coincidir exactamente', () => {
    const solo = vi.fn();
    const conCtrl = vi.fn();
    mouse.register('Mouse4', solo);
    mouse.register('Ctrl+Mouse4', conCtrl);

    pulsar(fake, 4, { ctrlKey: true });
    expect(conCtrl).toHaveBeenCalledTimes(1);
    expect(solo).not.toHaveBeenCalled();

    pulsar(fake, 4);
    expect(solo).toHaveBeenCalledTimes(1);

    pulsar(fake, 4, { ctrlKey: true, shiftKey: true }); // Ctrl+Shift: ninguno
    expect(conCtrl).toHaveBeenCalledTimes(1);
    expect(solo).toHaveBeenCalledTimes(1);
  });

  it('unregisterAll suelta los atajos y el hook; re-registrar no duplica el oyente', () => {
    const guardar = vi.fn();
    mouse.register('Mouse5', guardar);
    mouse.unregisterAll();
    expect(fake.stopped).toBe(1);
    pulsar(fake, 5);
    expect(guardar).not.toHaveBeenCalled();

    mouse.register('Mouse5', guardar);
    pulsar(fake, 5);
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(fake.listenerCount('mousedown')).toBe(1);
  });

  it('rechaza teclas y aceleradores inválidos sin pedir el hook', () => {
    expect(mouse.register('F8', vi.fn())).toBe(false);
    expect(mouse.register('Mouse3', vi.fn())).toBe(false);
    expect(fake.started).toBe(0);
  });

  it('sin módulo nativo el registro falla sin lanzar', () => {
    const sinHook = new MouseHotkeys(new GlobalHook(null));
    expect(sinHook.register('Mouse4', vi.fn())).toBe(false);
    expect(() => sinHook.unregisterAll()).not.toThrow();
  });
});
