import { randomUUID } from 'node:crypto';
import { IpcChannel, IpcEvent } from '@shared/ipc';
import type { HdrRestartAnswer, HdrRestartRequest } from '@shared/ipc';

/** Lo mínimo de `ipcMain` que hace falta (inyectable para los tests). */
export interface PromptIpc {
  handle(channel: string, listener: (event: unknown, req: unknown) => unknown): void;
}

/** Lo mínimo de la ventana principal que hace falta para preguntar en el renderer. */
export interface PromptWindow {
  isDestroyed(): boolean;
  isVisible(): boolean;
  once(event: 'closed', listener: () => void): void;
  webContents: {
    isDestroyed(): boolean;
    send(channel: string, payload: HdrRestartRequest): void;
  };
}

function esRespuesta(valor: unknown): valor is HdrRestartAnswer {
  return valor === 'now' || valor === 'later';
}

/**
 * Preguntas que el main hace con un modal de la app en lugar de un diálogo nativo. Hoy solo una: si
 * reiniciar para aplicar la compatibilidad HDR de las capturas.
 */
export class UiPrompts {
  private readonly pending = new Map<string, (answer: HdrRestartAnswer) => void>();

  constructor(private readonly newId: () => string = randomUUID) {}

  register(ipc: PromptIpc): void {
    ipc.handle(IpcChannel.UiHdrRestartAnswer, (_event, req) => {
      const { id, answer } = (req ?? {}) as { id?: unknown; answer?: unknown };
      if (typeof id !== 'string' || !esRespuesta(answer)) return;
      this.pending.get(id)?.(answer);
    });
  }

  /**
   * Pregunta en el renderer. Devuelve `null` si no se puede preguntar ahí (sin ventana, o la ventana
   * está oculta en la bandeja): el que llama usa entonces el diálogo nativo, para que la pregunta
   * nunca se pierda. Si la ventana se cierra con la pregunta abierta, cuenta como «Al próximo
   * arranque» (lo mismo que cancelar el diálogo nativo).
   */
  askHdrRestart(win: PromptWindow | null): Promise<HdrRestartAnswer | null> {
    if (!win || win.isDestroyed() || win.webContents.isDestroyed() || !win.isVisible()) {
      return Promise.resolve(null);
    }
    const id = this.newId();
    return new Promise((resolve) => {
      const terminar = (answer: HdrRestartAnswer) => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        resolve(answer);
      };
      this.pending.set(id, terminar);
      win.once('closed', () => terminar('later'));
      win.webContents.send(IpcEvent.UiAskHdrRestart, { id });
    });
  }
}
