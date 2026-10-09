import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it } from 'vitest';
import { GlobalHook } from '../capture/global-hook';

// Hook falso: cuenta arranques y paradas sin tocar el teclado real.
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

describe('GlobalHook', () => {
  let fake: FakeHook;
  let hook: GlobalHook;

  beforeEach(() => {
    fake = new FakeHook();
    hook = new GlobalHook({ uIOhook: fake, UiohookKey: { F9: 67 } });
  });

  it('dos consumidores arrancan el hook una sola vez y solo el último lo para', () => {
    hook.setNeeded('push-to-talk', true);
    hook.setNeeded('mouse-hotkeys', true);
    expect(fake.started).toBe(1);

    hook.setNeeded('push-to-talk', false);
    expect(fake.stopped).toBe(0);
    hook.setNeeded('mouse-hotkeys', false);
    expect(fake.stopped).toBe(1);
  });

  it('setNeeded es idempotente: repetirlo no infla el recuento', () => {
    hook.setNeeded('mouse-hotkeys', true);
    hook.setNeeded('mouse-hotkeys', true);
    hook.setNeeded('mouse-hotkeys', false);
    expect(fake.started).toBe(1);
    expect(fake.stopped).toBe(1);
    hook.setNeeded('mouse-hotkeys', false);
    expect(fake.stopped).toBe(1);
  });

  it('reenvía los eventos a los oyentes y expone el mapa de teclas', () => {
    const vistos: unknown[] = [];
    expect(hook.on('mousedown', (e) => vistos.push(e.button))).toBe(true);
    fake.emit('mousedown', { button: 4 });
    expect(vistos).toEqual([4]);
    expect(hook.keyMap).toEqual({ F9: 67 });
  });

  it('stop() lo para aunque queden consumidores (cierre de la app)', () => {
    hook.setNeeded('push-to-talk', true);
    hook.stop();
    expect(fake.stopped).toBe(1);
    hook.stop();
    expect(fake.stopped).toBe(1);
  });

  it('sin módulo nativo: no disponible y nada lanza', () => {
    const roto = new GlobalHook(null);
    expect(roto.available).toBe(false);
    expect(roto.keyMap).toEqual({});
    expect(roto.on('mousedown', () => {})).toBe(false);
    expect(() => roto.setNeeded('mouse-hotkeys', true)).not.toThrow();
    expect(() => roto.stop()).not.toThrow();
  });
});
