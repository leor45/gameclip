import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CAPTURE_SETTINGS, type CaptureSettings } from '@shared/capture';
import { useCaptureSettings } from '../views/ajustes/useCaptureSettings';
import { crearGameclipMock } from './setup';

type GameclipMock = ReturnType<typeof crearGameclipMock>;

function mock(): GameclipMock {
  return window.gameclip as unknown as GameclipMock;
}

/** Captura el listener de settings:changed para dispararlo como lo haría el main. */
let emitirAjustes: (s: CaptureSettings) => void = () => undefined;

beforeEach(() => {
  Object.defineProperty(window, 'gameclip', { writable: true, value: crearGameclipMock() });
  mock().capture.onSettingsChanged.mockImplementation((listener: (s: CaptureSettings) => void) => {
    emitirAjustes = listener;
    return () => undefined;
  });
});

async function montar() {
  const hook = renderHook(() => useCaptureSettings());
  await waitFor(() => expect(hook.result.current.settings).not.toBeNull());
  return hook;
}

describe('useCaptureSettings (regresión: cada sección pisaba ajustes cambiados por otras vías)', () => {
  it('guardar solo manda lo editado: no pisa un cambio hecho desde la barra superior', async () => {
    const { result } = await montar();

    // Otra vía (la barra superior) cambia la duración mientras la sección está abierta.
    act(() => emitirAjustes({ ...DEFAULT_CAPTURE_SETTINGS, replaySeconds: 120 }));
    act(() => result.current.set('overlayEnabled', false));
    await act(() => result.current.save());

    expect(mock().capture.setSettings).toHaveBeenCalledWith({ overlayEnabled: false });
  });

  it('un settings:changed ajeno no pisa un campo editado y no guardado', async () => {
    const { result } = await montar();
    act(() => result.current.set('replaySeconds', 30));
    act(() => emitirAjustes({ ...DEFAULT_CAPTURE_SETTINGS, replaySeconds: 120, overlayEnabled: false }));

    expect(result.current.settings?.replaySeconds).toBe(30); // lo editado se respeta
    expect(result.current.settings?.overlayEnabled).toBe(false); // lo demás se actualiza
  });

  it('guardar sin cambios no llama al main', async () => {
    const { result } = await montar();
    await act(() => result.current.save());
    expect(mock().capture.setSettings).not.toHaveBeenCalled();
    expect(result.current.saved).toBe(true);
  });
});
