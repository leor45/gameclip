import { describe, expect, it } from 'vitest';
import { DEFAULT_CAPTURE_SETTINGS } from '../capture';
import type { KeyPress } from '../hotkeys';
import {
  HOTKEY_ACTIONS,
  accelFromKeyPress,
  hotkeyCollisions,
  isHotkeyActive,
  isPttReserved,
  isValidAccelerator,
} from '../hotkeys';

/** Pulsación sin modificadores; los tests activan los que necesiten. */
function press(partial: Partial<KeyPress> & Pick<KeyPress, 'key' | 'code'>): KeyPress {
  return { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...partial };
}

describe('accelFromKeyPress', () => {
  it('arma el acelerador con los modificadores en el orden de Electron', () => {
    expect(accelFromKeyPress(press({ key: 'c', code: 'KeyC', altKey: true }))).toBe('Alt+C');
    expect(
      accelFromKeyPress(press({ key: 'S', code: 'KeyS', ctrlKey: true, shiftKey: true })),
    ).toBe('Ctrl+Shift+S');
    expect(accelFromKeyPress(press({ key: 'F8', code: 'F8' }))).toBe('F8');
    // Hay entornos que no rellenan `code` en las teclas de función: `key` basta.
    expect(accelFromKeyPress(press({ key: 'F8', code: '' }))).toBe('F8');
    expect(accelFromKeyPress(press({ key: '4', code: 'Digit4', ctrlKey: true }))).toBe('Ctrl+4');
  });

  it('mientras solo hay modificadores no resuelve nada (el botón sigue escuchando)', () => {
    expect(accelFromKeyPress(press({ key: 'Control', code: 'ControlLeft', ctrlKey: true }))).toBeNull();
    expect(accelFromKeyPress(press({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }))).toBeNull();
    expect(accelFromKeyPress(press({ key: 'Alt', code: 'AltLeft', altKey: true }))).toBeNull();
  });

  it('rechaza teclas que Electron no registra (mejor eso que un atajo mudo)', () => {
    expect(accelFromKeyPress(press({ key: 'Dead', code: 'Backquote' }))).toBeNull();
    expect(accelFromKeyPress(press({ key: 'AudioVolumeMute', code: 'AudioVolumeMute' }))).toBeNull();
  });

  it('traduce flechas y teclas especiales al nombre de Electron', () => {
    expect(accelFromKeyPress(press({ key: 'ArrowUp', code: 'ArrowUp' }))).toBe('Up');
    expect(accelFromKeyPress(press({ key: ' ', code: 'Space', ctrlKey: true }))).toBe('Ctrl+Space');
  });
});

describe('isValidAccelerator', () => {
  it('acepta los aceleradores que Electron entiende', () => {
    for (const accel of ['F8', 'Alt+C', 'Ctrl+Shift+S', 'Super+1', 'Ctrl+Up']) {
      expect(isValidAccelerator(accel)).toBe(true);
    }
  });

  it('rechaza basura, modificadores repetidos y teclas base inexistentes', () => {
    for (const accel of ['asdf', '', 'Ctrl+', 'Ctrl+Ctrl+A', 'Mayus+A', 'F25']) {
      expect(isValidAccelerator(accel)).toBe(false);
    }
  });
});

describe('hotkeyCollisions', () => {
  const base = DEFAULT_CAPTURE_SETTINGS;

  it('los defaults no chocan entre sí', () => {
    expect(hotkeyCollisions(base)).toEqual([]);
  });

  it('agrupa las acciones activas que comparten tecla (sin importar mayúsculas)', () => {
    const chocan = hotkeyCollisions({ ...base, recordingHotkey: 'f8' }); // replayHotkey es F8
    expect(chocan).toEqual([['replayHotkey', 'recordingHotkey']]);
  });

  it('una acción apagada no choca: su atajo no se registra', () => {
    const s = { ...base, screenshotHotkey: 'F8', screenshotsEnabled: false };
    expect(hotkeyCollisions(s)).toEqual([]);
    // Y encendiéndola, la colisión aparece.
    expect(hotkeyCollisions({ ...s, screenshotsEnabled: true })).toEqual([
      ['replayHotkey', 'screenshotHotkey'],
    ]);
  });

  it("con el modo de grabación en 'off', clip y grabación no chocan (no se registran)", () => {
    const s = { ...base, recordingMode: 'off' as const, recordingHotkey: 'F8' };
    expect(hotkeyCollisions(s)).toEqual([]);
  });
});

describe('isHotkeyActive', () => {
  const accion = (key: string) => HOTKEY_ACTIONS.find((a) => a.key === key)!;

  it('el clip y la grabación se apagan con el modo de grabación', () => {
    const off = { ...DEFAULT_CAPTURE_SETTINGS, recordingMode: 'off' as const };
    expect(isHotkeyActive(accion('replayHotkey'), off)).toBe(false);
    expect(isHotkeyActive(accion('recordingHotkey'), off)).toBe(false);
    expect(isHotkeyActive(accion('replayHotkey'), DEFAULT_CAPTURE_SETTINGS)).toBe(true);
  });

  it('la captura y el cambio de juego dependen de su propio interruptor', () => {
    const s = { ...DEFAULT_CAPTURE_SETTINGS, screenshotsEnabled: false };
    expect(isHotkeyActive(accion('screenshotHotkey'), s)).toBe(false);
    expect(isHotkeyActive(accion('gameSwitchHotkey'), s)).toBe(true);
  });
});

describe('isPttReserved', () => {
  it('la tecla suelta del push to talk no se puede usar como atajo', () => {
    expect(isPttReserved('F9', 'F9')).toBe(true);
    expect(isPttReserved('f9', 'F9')).toBe(true);
  });

  it('una combinación con esa tecla SÍ se puede: es otra pulsación', () => {
    expect(isPttReserved('Ctrl+F9', 'F9')).toBe(false);
  });

  it('los botones del ratón del PTT no son aceleradores: nunca reservan nada', () => {
    expect(isPttReserved('F9', 'Mouse4')).toBe(false);
  });
});
