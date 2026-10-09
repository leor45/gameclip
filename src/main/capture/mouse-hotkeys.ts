import type { MouseAccelerator } from '@shared/hotkeys';
import { parseMouseAccelerator } from '@shared/hotkeys';
import type { GlobalHook, HookEvent } from './global-hook';

interface Registro {
  accel: MouseAccelerator;
  callback: () => void;
}

/**
 * Atajos globales con los botones laterales del ratón (`Mouse4`, `Ctrl+Mouse5`…). `globalShortcut`
 * de Electron solo entiende teclas, así que estos van por el hook global compartido con el
 * push-to-talk. Igual que `globalShortcut`, no se intercepta el botón: el juego lo sigue recibiendo.
 */
export class MouseHotkeys {
  private registros: Registro[] = [];
  private listening = false;

  constructor(private readonly hook: GlobalHook) {}

  /** false si el acelerador no es de ratón o el hook nativo no está (el atajo no funcionará). */
  register(accelerator: string, callback: () => void): boolean {
    const accel = parseMouseAccelerator(accelerator);
    if (!accel || !this.hook.available) return false;
    if (!this.listening) {
      this.listening = this.hook.on('mousedown', (e) => this.alPulsar(e));
    }
    this.registros.push({ accel, callback });
    this.hook.setNeeded('mouse-hotkeys', true);
    return true;
  }

  unregisterAll(): void {
    this.registros = [];
    this.hook.setNeeded('mouse-hotkeys', false);
  }

  private alPulsar(e: HookEvent): void {
    // Modificadores exactos: `Ctrl+Mouse4` no dispara `Mouse4`, ni al revés (como las teclas).
    const registro = this.registros.find(
      ({ accel }) =>
        e.button === accel.button &&
        Boolean(e.ctrlKey) === accel.ctrl &&
        Boolean(e.altKey) === accel.alt &&
        Boolean(e.shiftKey) === accel.shift &&
        Boolean(e.metaKey) === accel.meta,
    );
    registro?.callback();
  }
}
