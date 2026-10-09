import { EventEmitter } from 'node:events';
import { PTT_HOTKEY_OPTIONS } from '@shared/capture';
import type { GlobalHook } from './global-hook';

export type PttTarget = { kind: 'key'; keycode: number } | { kind: 'mouse'; button: number };

/**
 * Resuelve un hotkey de PTT (PTT_HOTKEY_OPTIONS) al objetivo del hook (helper puro).
 * 'Mouse4'/'Mouse5' → botones laterales (numeración de libuiohook); el resto, keycodes
 * de UiohookKey. Devuelve null si el nombre no es válido o el mapa no lo trae.
 */
export function resolvePttHotkey(
  hotkey: string,
  keyMap: Record<string, number>,
): PttTarget | null {
  if (!PTT_HOTKEY_OPTIONS.includes(hotkey)) return null;
  if (hotkey === 'Mouse4') return { kind: 'mouse', button: 4 };
  if (hotkey === 'Mouse5') return { kind: 'mouse', button: 5 };
  const keycode = keyMap[hotkey];
  return typeof keycode === 'number' ? { kind: 'key', keycode } : null;
}

/**
 * Push-to-talk global: emite 'held' (boolean) mientras el hotkey configurado está pulsado.
 * Corre sobre el hook global compartido (`GlobalHook`, uiohook-napi); solo se compara el keycode
 * configurado, no se registra nada más.
 */
export class PushToTalk extends EventEmitter {
  private listening = false;
  private target: PttTarget | null = null;
  private held = false;

  constructor(private readonly hook: GlobalHook) {
    super();
  }

  /** false solo si el módulo nativo no cargó (la UI muestra el aviso). */
  get available(): boolean {
    return this.hook.available;
  }

  /** Aplica los ajustes: pide o suelta el hook según haga falta. */
  configure(enabled: boolean, hotkey: string): void {
    if (!this.hook.available) return;
    this.target = enabled ? resolvePttHotkey(hotkey, this.hook.keyMap) : null;
    if (this.target) this.attachListeners();
    this.hook.setNeeded('push-to-talk', this.target !== null);
    this.setHeld(false); // al (re)configurar, el mic parte cerrado hasta pulsar de nuevo
  }

  private attachListeners(): void {
    if (this.listening) return;
    this.listening = true;
    this.hook.on('keydown', (e) => {
      if (this.target?.kind === 'key' && e.keycode === this.target.keycode) this.setHeld(true);
    });
    this.hook.on('keyup', (e) => {
      if (this.target?.kind === 'key' && e.keycode === this.target.keycode) this.setHeld(false);
    });
    this.hook.on('mousedown', (e) => {
      if (this.target?.kind === 'mouse' && e.button === this.target.button) this.setHeld(true);
    });
    this.hook.on('mouseup', (e) => {
      if (this.target?.kind === 'mouse' && e.button === this.target.button) this.setHeld(false);
    });
  }

  private setHeld(held: boolean): void {
    if (held === this.held) return;
    this.held = held;
    this.emit('held', held);
  }
}
