import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { PTT_HOTKEY_OPTIONS } from '@shared/capture';

// Superficie mínima de uiohook-napi (require falible: sin el prebuilt, PTT se desactiva).
interface UiohookEmitter {
  on(event: string, cb: (e: { keycode?: number; button?: unknown }) => void): void;
  start(): void;
  stop(): void;
}
interface UiohookModule {
  uIOhook: UiohookEmitter;
  UiohookKey: Record<string, number>;
}

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
 * El hook de teclado/mouse es de bajo nivel (uiohook-napi); solo se compara el keycode
 * configurado, no se registra nada más.
 */
export class PushToTalk extends EventEmitter {
  private module: UiohookModule | null = null;
  private loadFailed = false;
  private started = false;
  private listening = false;
  private target: PttTarget | null = null;
  private held = false;

  constructor(moduleOverride?: UiohookModule) {
    super();
    if (moduleOverride) this.module = moduleOverride;
  }

  /** false solo si el módulo nativo no cargó (la UI muestra el aviso). */
  get available(): boolean {
    this.load();
    return this.module !== null;
  }

  /** Aplica los ajustes: arranca o detiene el hook según haga falta. */
  configure(enabled: boolean, hotkey: string): void {
    this.load();
    const mod = this.module;
    if (!mod) return;
    this.target = enabled ? resolvePttHotkey(hotkey, mod.UiohookKey) : null;

    if (this.target) {
      this.attachListeners(mod);
      if (!this.started) {
        mod.uIOhook.start();
        this.started = true;
      }
    } else if (this.started) {
      mod.uIOhook.stop();
      this.started = false;
    }
    this.setHeld(false); // al (re)configurar, el mic parte cerrado hasta pulsar de nuevo
  }

  stop(): void {
    if (this.module && this.started) {
      try {
        this.module.uIOhook.stop();
      } catch {
        // el proceso termina igual
      }
      this.started = false;
    }
  }

  private load(): void {
    if (this.module || this.loadFailed) return;
    try {
      const require = createRequire(__filename);
      this.module = require('uiohook-napi') as UiohookModule;
    } catch {
      this.loadFailed = true;
    }
  }

  private attachListeners(mod: UiohookModule): void {
    if (this.listening) return;
    this.listening = true;
    mod.uIOhook.on('keydown', (e) => {
      if (this.target?.kind === 'key' && e.keycode === this.target.keycode) this.setHeld(true);
    });
    mod.uIOhook.on('keyup', (e) => {
      if (this.target?.kind === 'key' && e.keycode === this.target.keycode) this.setHeld(false);
    });
    mod.uIOhook.on('mousedown', (e) => {
      if (this.target?.kind === 'mouse' && e.button === this.target.button) this.setHeld(true);
    });
    mod.uIOhook.on('mouseup', (e) => {
      if (this.target?.kind === 'mouse' && e.button === this.target.button) this.setHeld(false);
    });
  }

  private setHeld(held: boolean): void {
    if (held === this.held) return;
    this.held = held;
    this.emit('held', held);
  }
}
