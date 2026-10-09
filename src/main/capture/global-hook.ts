import { createRequire } from 'node:module';

/** Evento de `uiohook-napi` (teclado o ratón): solo los campos que usan sus consumidores. */
export interface HookEvent {
  keycode?: number;
  button?: unknown;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
}

export type HookEventName = 'keydown' | 'keyup' | 'mousedown' | 'mouseup';

// Superficie mínima de uiohook-napi (require falible: sin el prebuilt, el hook no está disponible).
interface UiohookEmitter {
  on(event: string, cb: (e: HookEvent) => void): void;
  start(): void;
  stop(): void;
}
export interface UiohookModule {
  uIOhook: UiohookEmitter;
  UiohookKey: Record<string, number>;
}

/**
 * Hook global de teclado y ratón (`uiohook-napi`), compartido por el push-to-talk y los atajos de
 * ratón. Hay **una** instancia nativa de `uIOhook` por proceso: si cada consumidor la arrancara y
 * parara por su cuenta, apagar el PTT dejaría sin hook a los atajos de ratón. Por eso cada
 * consumidor declara si lo necesita (`setNeeded`) y el hook corre mientras alguno lo necesite.
 */
export class GlobalHook {
  private module: UiohookModule | null = null;
  private loadFailed = false;
  private started = false;
  private readonly users = new Set<string>();

  /** `moduleOverride`: módulo inyectado (tests); `null` simula que el nativo no cargó. */
  constructor(moduleOverride?: UiohookModule | null) {
    if (moduleOverride) this.module = moduleOverride;
    else if (moduleOverride === null) this.loadFailed = true;
  }

  /** false solo si el módulo nativo no cargó (la UI muestra el aviso). */
  get available(): boolean {
    return this.load() !== null;
  }

  /** Mapa de keycodes de libuiohook (`UiohookKey`); vacío sin módulo. */
  get keyMap(): Record<string, number> {
    return this.load()?.UiohookKey ?? {};
  }

  /** Suscribe un oyente; false si el módulo nativo no está (el oyente nunca recibirá nada). */
  on(event: HookEventName, cb: (e: HookEvent) => void): boolean {
    const mod = this.load();
    if (!mod) return false;
    mod.uIOhook.on(event, cb);
    return true;
  }

  /**
   * Declara si el consumidor `user` necesita el hook. Idempotente: llamarlo dos veces con el mismo
   * valor no cambia el recuento. Arranca el hook con el primer usuario y lo para con el último.
   */
  setNeeded(user: string, needed: boolean): void {
    const mod = this.load();
    if (!mod) return;
    if (needed) this.users.add(user);
    else this.users.delete(user);

    if (this.users.size > 0 && !this.started) {
      mod.uIOhook.start();
      this.started = true;
    } else if (this.users.size === 0 && this.started) {
      mod.uIOhook.stop();
      this.started = false;
    }
  }

  /** Cierre de la app: para el hook aunque queden usuarios. */
  stop(): void {
    this.users.clear();
    if (this.module && this.started) {
      try {
        this.module.uIOhook.stop();
      } catch {
        // el proceso termina igual
      }
      this.started = false;
    }
  }

  private load(): UiohookModule | null {
    if (this.module || this.loadFailed) return this.module;
    try {
      const require = createRequire(__filename);
      this.module = require('uiohook-napi') as UiohookModule;
    } catch {
      this.loadFailed = true;
    }
    return this.module;
  }
}
