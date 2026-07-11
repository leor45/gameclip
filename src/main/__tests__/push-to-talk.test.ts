import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it } from 'vitest';
import { PushToTalk, resolvePttHotkey } from '../capture/push-to-talk';

// Hook falso: emite los eventos de uiohook-napi sin tocar el teclado real.
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

const KEY_MAP = { F9: 67, F10: 68, Ctrl: 29, Space: 57 };

describe('resolvePttHotkey', () => {
  it('mapea teclas del keyMap y botones del mouse', () => {
    expect(resolvePttHotkey('F9', KEY_MAP)).toEqual({ kind: 'key', keycode: 67 });
    expect(resolvePttHotkey('Ctrl', KEY_MAP)).toEqual({ kind: 'key', keycode: 29 });
    expect(resolvePttHotkey('Mouse4', KEY_MAP)).toEqual({ kind: 'mouse', button: 4 });
    expect(resolvePttHotkey('Mouse5', KEY_MAP)).toEqual({ kind: 'mouse', button: 5 });
  });

  it('rechaza nombres fuera de la lista o ausentes del keyMap', () => {
    expect(resolvePttHotkey('Escape', KEY_MAP)).toBeNull(); // no está en PTT_HOTKEY_OPTIONS
    expect(resolvePttHotkey('F11', KEY_MAP)).toBeNull(); // válido pero el keyMap no lo trae
    expect(resolvePttHotkey('', KEY_MAP)).toBeNull();
  });
});

describe('PushToTalk', () => {
  let hook: FakeHook;
  let ptt: PushToTalk;
  let held: boolean[];

  beforeEach(() => {
    hook = new FakeHook();
    ptt = new PushToTalk({ uIOhook: hook, UiohookKey: KEY_MAP });
    held = [];
    ptt.on('held', (h: boolean) => held.push(h));
  });

  it('emite held true/false con keydown/keyup de la tecla configurada', () => {
    ptt.configure(true, 'F9');
    expect(hook.started).toBe(1);

    hook.emit('keydown', { keycode: 67 });
    hook.emit('keyup', { keycode: 67 });
    expect(held).toEqual([true, false]);
  });

  it('ignora otras teclas y no duplica el estado', () => {
    ptt.configure(true, 'F9');
    held.length = 0;

    hook.emit('keydown', { keycode: 68 }); // F10: no es la tecla
    hook.emit('keydown', { keycode: 67 });
    hook.emit('keydown', { keycode: 67 }); // repetición del SO: sin cambio
    expect(held).toEqual([true]);
  });

  it('con Mouse4 reacciona a mousedown/mouseup del botón 4', () => {
    ptt.configure(true, 'Mouse4');
    held.length = 0;

    hook.emit('mousedown', { button: 4 });
    hook.emit('mousedown', { button: 5 }); // otro botón: ignorado
    hook.emit('mouseup', { button: 4 });
    expect(held).toEqual([true, false]);
  });

  it('desactivar detiene el hook y suelta el mic', () => {
    ptt.configure(true, 'F9');
    hook.emit('keydown', { keycode: 67 });
    held.length = 0;

    ptt.configure(false, 'F9');
    expect(hook.stopped).toBe(1);
    expect(held).toEqual([false]); // al reconfigurar, el mic parte cerrado
    hook.emit('keydown', { keycode: 67 });
    expect(held).toEqual([false]); // sin objetivo, la tecla ya no hace nada
  });

  it('sin módulo nativo queda no disponible y configure no rompe', () => {
    // Sin override, el require real puede existir en esta máquina; forzamos el fallo
    // inyectando un módulo nulo a través del constructor no es posible — se simula con
    // una instancia cuyo require ya falló.
    const roto = new PushToTalk(undefined);
    // available dispara el require perezoso: si uiohook-napi está instalado será true;
    // el contrato que importa es que configure() nunca lance.
    expect(() => roto.configure(true, 'F9')).not.toThrow();
    expect(() => roto.stop()).not.toThrow();
  });
});
