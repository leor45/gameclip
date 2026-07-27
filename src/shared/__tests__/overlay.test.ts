import { describe, expect, it } from 'vitest';
import { DEFAULT_CAPTURE_SETTINGS, type CaptureSettings } from '../capture';
import {
  buildGameNotice,
  describeReplayDuration,
  overlayStateFor,
  overlayWindowPosition,
} from '../overlay';

function ajustes(overrides: Partial<CaptureSettings> = {}): CaptureSettings {
  return { ...DEFAULT_CAPTURE_SETTINGS, ...overrides };
}

describe('describeReplayDuration', () => {
  it('traduce la duración del buffer a lenguaje natural', () => {
    expect(describeReplayDuration(30)).toBe('los últimos 30 segundos');
    expect(describeReplayDuration(60)).toBe('el último minuto');
    expect(describeReplayDuration(90)).toBe('el último minuto y medio');
    expect(describeReplayDuration(120)).toBe('los últimos 2 minutos');
  });

  it('un valor raro (no redondo) cae a segundos', () => {
    expect(describeReplayDuration(100)).toBe('los últimos 100 segundos');
  });
});

describe('overlayWindowPosition', () => {
  const TAMANO = { left: { width: 340, height: 220 }, right: { width: 160, height: 60 } };

  it('pega cada zona a su esquina superior del work area, con margen', () => {
    const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
    expect(overlayWindowPosition('left', workArea, TAMANO.left, 16)).toEqual({ x: 16, y: 16 });
    expect(overlayWindowPosition('right', workArea, TAMANO.right, 16)).toEqual({ x: 1744, y: 16 });
  });

  /**
   * Regresión del monitor encendido tarde: la posición se calculaba UNA vez, al crear la ventana, y
   * los avisos se quedaban en el monitor que era primario entonces. Con el origen del work area
   * dentro de la cuenta, recalcularla en cada aparición los lleva al monitor de ahora.
   */
  it('respeta el origen del monitor (no asume que el work area empieza en 0,0)', () => {
    const secundario = { x: -1920, y: 120, width: 1920, height: 1040 };
    expect(overlayWindowPosition('left', secundario, TAMANO.left, 16)).toEqual({
      x: -1904,
      y: 136,
    });
    expect(overlayWindowPosition('right', secundario, TAMANO.right, 16)).toEqual({
      x: -176,
      y: 136,
    });
  });
});

describe('buildGameNotice', () => {
  it('anuncia el estado y las hotkeys REALMENTE configuradas', () => {
    const aviso = buildGameNotice(
      ajustes({
        replayHotkey: 'F9',
        replaySeconds: 60,
        recordingHotkey: 'F7',
        screenshotsEnabled: true,
        screenshotHotkey: 'F6',
      }),
    );

    expect(aviso).toEqual({
      title: 'Listo para clipear',
      hotkeys: [
        { key: 'F9', label: 'Guardar el último minuto' },
        { key: 'F7', label: 'Grabar / detener' },
        { key: 'F6', label: 'Guardar una captura' },
      ],
      controllerCapture: false,
    });
  });

  it('marca controllerCapture según el ajuste del botón de mandos', () => {
    expect(buildGameNotice(ajustes({}))?.controllerCapture).toBe(false);
    expect(buildGameNotice(ajustes({ controllerCaptureEnabled: true }))?.controllerCapture).toBe(
      true,
    );
  });

  it('la fila del clip refleja la duración del buffer configurada', () => {
    const aviso = buildGameNotice(ajustes({ replaySeconds: 30, screenshotsEnabled: false }));

    expect(aviso?.hotkeys[0].label).toBe('Guardar los últimos 30 segundos');
  });

  it('con las capturas desactivadas, su fila no aparece', () => {
    const aviso = buildGameNotice(ajustes({ screenshotsEnabled: false }));

    expect(aviso?.hotkeys.map((h) => h.label)).toEqual([
      expect.stringContaining('Guardar el último'),
      'Grabar / detener',
    ]);
  });

  it('en modo apagado no hay nada que anunciar', () => {
    expect(buildGameNotice(ajustes({ recordingMode: 'off' }))).toBeNull();
  });

  it('sin ninguna hotkey activa no se muestra el aviso (no diría nada útil)', () => {
    expect(
      buildGameNotice(
        ajustes({ replayHotkey: '', recordingHotkey: '', screenshotsEnabled: false }),
      ),
    ).toBeNull();
  });
});

describe('overlayStateFor', () => {
  const completo = {
    recording: true,
    toast: 'Clip guardado ✓',
    notice: {
      title: 'Listo para clipear',
      hotkeys: [{ key: 'F8', label: 'Guardar' }],
      controllerCapture: false,
    },
  };

  it('la esquina izquierda pinta los avisos, no el REC', () => {
    expect(overlayStateFor('left', completo)).toEqual({
      recording: false,
      toast: 'Clip guardado ✓',
      notice: completo.notice,
    });
  });

  it('la esquina derecha pinta el REC, no los avisos', () => {
    expect(overlayStateFor('right', completo)).toEqual({
      recording: true,
      toast: null,
      notice: null,
    });
  });
});
