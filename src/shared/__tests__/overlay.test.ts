import { describe, expect, it } from 'vitest';
import { DEFAULT_CAPTURE_SETTINGS, type CaptureSettings } from '../capture';
import { buildGameNotice, describeReplayDuration } from '../overlay';

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

describe('buildGameNotice', () => {
  it('anuncia el estado y las hotkeys REALMENTE configuradas', () => {
    const aviso = buildGameNotice(
      ajustes({
        replayHotkey: 'F9',
        replaySeconds: 60,
        screenshotsEnabled: true,
        screenshotHotkey: 'F6',
      }),
    );

    expect(aviso).toEqual({
      title: 'Listo para clipear',
      hotkeys: [
        { key: 'F9', label: 'Guardar el último minuto' },
        { key: 'F6', label: 'Guardar una captura' },
      ],
    });
  });

  it('la fila del clip refleja la duración del buffer configurada', () => {
    const aviso = buildGameNotice(ajustes({ replaySeconds: 30, screenshotsEnabled: false }));

    expect(aviso?.hotkeys[0].label).toBe('Guardar los últimos 30 segundos');
  });

  it('con las capturas desactivadas, su fila no aparece', () => {
    const aviso = buildGameNotice(ajustes({ screenshotsEnabled: false }));

    expect(aviso?.hotkeys.map((h) => h.label)).toEqual([
      expect.stringContaining('Guardar el último'),
    ]);
  });

  it('en modo apagado no hay nada que anunciar', () => {
    expect(buildGameNotice(ajustes({ recordingMode: 'off' }))).toBeNull();
  });

  it('sin ninguna hotkey activa no se muestra el aviso (no diría nada útil)', () => {
    expect(
      buildGameNotice(ajustes({ replayHotkey: '', screenshotsEnabled: false })),
    ).toBeNull();
  });
});
