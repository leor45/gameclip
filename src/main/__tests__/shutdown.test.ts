import { describe, expect, it, vi } from 'vitest';
import { finalizarGrabacion, teardown, type PartesDelCierre } from '../shutdown';

/**
 * Bandeja falsa con la semántica real de Electron: tocar un `Tray` ya destruido **lanza**
 * ("Tray is destroyed"). Es lo que convierte un orden de cierre equivocado en una excepción no
 * controlada, y por tanto en el diálogo de error que veía el owner al cerrar la app.
 */
function bandejaFalsa() {
  let destruida = false;
  return {
    get destruida() {
      return destruida;
    },
    setRecording: vi.fn((grabando: boolean) => {
      if (destruida) throw new Error(`Tray is destroyed (setRecording ${grabando})`);
    }),
    destroy: vi.fn(() => {
      destruida = true;
    }),
  };
}

/**
 * Captura falsa que reproduce lo esencial del `CaptureManager`: apagarse **no es silencioso**, emite
 * un `status` final (idle) que sus oyentes reciben.
 */
function capturaFalsa(alApagarse: () => void) {
  return { shutdown: vi.fn(alApagarse) };
}

function partes(over: Partial<PartesDelCierre> = {}): PartesDelCierre {
  return {
    unregisterHotkeys: vi.fn(),
    globalHook: { stop: vi.fn() },
    clearTimers: vi.fn(),
    detector: { stop: vi.fn() },
    capture: { shutdown: vi.fn() },
    overlay: { destroy: vi.fn() },
    tray: { destroy: vi.fn() },
    api: { close: vi.fn() },
    limpiarTemporales: vi.fn(),
    ...over,
  };
}

describe('teardown', () => {
  // REGRESIÓN: el bug era destruir la bandeja ANTES de apagar la captura. El `status` final del
  // shutdown le llegaba a una bandeja muerta y Electron mostraba "Tray is destroyed".
  it('la captura se apaga mientras la bandeja sigue viva', () => {
    const tray = bandejaFalsa();
    // El oyente real de index.ts: cada status del manager repinta el icono de la bandeja.
    const capture = capturaFalsa(() => tray.setRecording(false));

    expect(() => teardown(partes({ capture, tray }))).not.toThrow();

    // El status final llegó, y llegó a una bandeja viva: si el orden estuviera invertido, el
    // setRecording habría lanzado "Tray is destroyed" (que es el bug).
    expect(tray.setRecording).toHaveBeenCalledTimes(1);
    expect(tray.destroy).toHaveBeenCalledTimes(1);
    expect(tray.destruida).toBe(true);
  });

  it('la captura se apaga mientras el overlay sigue vivo', () => {
    const orden: string[] = [];
    const capture = { shutdown: vi.fn(() => orden.push('captura')) };
    const overlay = { destroy: vi.fn(() => orden.push('overlay')) };

    teardown(partes({ capture, overlay }));

    expect(orden).toEqual(['captura', 'overlay']);
  });

  it('primero calla a los emisores (hotkeys, PTT, timers, detector) y después apaga la captura', () => {
    const orden: string[] = [];
    const p = partes({
      unregisterHotkeys: vi.fn(() => orden.push('hotkeys')),
      globalHook: { stop: vi.fn(() => orden.push('hook')) },
      clearTimers: vi.fn(() => orden.push('timers')),
      detector: { stop: vi.fn(() => orden.push('detector')) },
      capture: { shutdown: vi.fn(() => orden.push('captura')) },
    });

    teardown(p);

    expect(orden).toEqual(['hotkeys', 'hook', 'timers', 'detector', 'captura']);
  });

  // Si un paso revienta, el cierre tiene que TERMINAR igual: si no, libobs y el puerto de la API
  // quedan colgados. Era el daño colateral del bug (la excepción abortaba el will-quit a mitad).
  it('la limpieza de temporales corre al final, después de cerrar todo', () => {
    const orden: string[] = [];
    const p = partes({
      capture: { shutdown: vi.fn(() => orden.push('captura')) },
      tray: { destroy: vi.fn(() => orden.push('bandeja')) },
      api: { close: vi.fn(() => orden.push('api')) },
      limpiarTemporales: vi.fn(() => orden.push('temporales')),
    });

    teardown(p);

    expect(orden).toEqual(['captura', 'bandeja', 'api', 'temporales']);
  });

  it('un paso que falla no impide los siguientes: la API se cierra igual', () => {
    const api = { close: vi.fn() };
    const capture = {
      shutdown: vi.fn(() => {
        throw new Error('libobs explotó');
      }),
    };
    const tray = bandejaFalsa();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => teardown(partes({ capture, tray, api }))).not.toThrow();

    expect(tray.destroy).toHaveBeenCalled();
    expect(api.close).toHaveBeenCalled();
  });

  it('tolera que no haya nada que cerrar (arranque a medias)', () => {
    const p = partes({ capture: null, tray: null, overlay: null, api: null, detector: null });
    expect(() => teardown(p)).not.toThrow();
  });
});

describe('finalizarGrabacion (regresión: salir grabando dejaba el vídeo en negro)', () => {
  function captura(estado: 'recording' | 'buffering', stop: () => Promise<unknown>) {
    return { getStatus: () => ({ state: estado }), stopRecording: vi.fn(stop) };
  }

  it('con una grabación en curso la para y espera a que termine', async () => {
    let terminada = false;
    const c = captura('recording', async () => {
      await new Promise((r) => setTimeout(r, 10));
      terminada = true;
    });
    await finalizarGrabacion(c, 1000);
    expect(c.stopRecording).toHaveBeenCalledOnce();
    expect(terminada).toBe(true);
  });

  it('no cuelga el cierre: resuelve al vencer el tope aunque parar no termine nunca', async () => {
    const c = captura('recording', () => new Promise(() => undefined));
    await expect(finalizarGrabacion(c, 20)).resolves.toBeUndefined();
  });

  it('un fallo al parar no impide salir', async () => {
    const c = captura('recording', () => Promise.reject(new Error('libobs no responde')));
    await expect(finalizarGrabacion(c, 1000)).resolves.toBeUndefined();
  });

  it('sin grabación en curso no toca nada', async () => {
    const c = captura('buffering', () => Promise.resolve());
    await finalizarGrabacion(c, 1000);
    expect(c.stopRecording).not.toHaveBeenCalled();
  });
});
