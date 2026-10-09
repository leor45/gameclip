import { describe, expect, it, vi } from 'vitest';
import { IpcChannel, IpcEvent } from '@shared/ipc';
import { UiPrompts, type PromptWindow } from '../ui-prompts';

function montar() {
  const handlers = new Map<string, (event: unknown, req: unknown) => unknown>();
  const prompts = new UiPrompts(() => 'id-1');
  prompts.register({ handle: (canal, fn) => handlers.set(canal, fn) });
  const responder = (req: unknown) => handlers.get(IpcChannel.UiHdrRestartAnswer)!(null, req);
  return { prompts, responder };
}

function ventana(opts: { visible?: boolean; destroyed?: boolean } = {}) {
  let alCerrar: () => void = () => undefined;
  const win = {
    isDestroyed: () => opts.destroyed ?? false,
    isVisible: () => opts.visible ?? true,
    once: (_e: 'closed', fn: () => void) => {
      alCerrar = fn;
    },
    webContents: { isDestroyed: () => false, send: vi.fn() },
  } satisfies PromptWindow;
  return { win, cerrar: () => alCerrar() };
}

describe('UiPrompts.askHdrRestart', () => {
  it('pregunta al renderer y resuelve con su respuesta', async () => {
    const { prompts, responder } = montar();
    const { win } = ventana();
    const respuesta = prompts.askHdrRestart(win);
    expect(win.webContents.send).toHaveBeenCalledWith(IpcEvent.UiAskHdrRestart, { id: 'id-1' });
    responder({ id: 'id-1', answer: 'now' });
    await expect(respuesta).resolves.toBe('now');
  });

  it('sin ventana, destruida u oculta en la bandeja → null (el main usa el diálogo nativo)', async () => {
    const { prompts } = montar();
    await expect(prompts.askHdrRestart(null)).resolves.toBeNull();
    await expect(prompts.askHdrRestart(ventana({ destroyed: true }).win)).resolves.toBeNull();
    await expect(prompts.askHdrRestart(ventana({ visible: false }).win)).resolves.toBeNull();
  });

  it('ignora respuestas con otro id o con valores raros, y solo cuenta la primera', async () => {
    const { prompts, responder } = montar();
    const { win } = ventana();
    const respuesta = prompts.askHdrRestart(win);
    responder({ id: 'otro', answer: 'now' });
    responder({ id: 'id-1', answer: 'ya' });
    responder(null);
    responder({ id: 'id-1', answer: 'later' });
    responder({ id: 'id-1', answer: 'now' });
    await expect(respuesta).resolves.toBe('later');
  });

  it('si la ventana se cierra con la pregunta abierta cuenta como «Al próximo arranque»', async () => {
    const { prompts } = montar();
    const { win, cerrar } = ventana();
    const respuesta = prompts.askHdrRestart(win);
    cerrar();
    await expect(respuesta).resolves.toBe('later');
  });
});
