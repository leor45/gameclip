import { describe, expect, it } from 'vitest';
import { DEFAULT_CAPTURE_SETTINGS } from '../capture';
import type { KeyPress, MousePress } from '../hotkeys';
import {
  HOTKEY_ACTIONS,
  accelFromKeyPress,
  accelFromMousePress,
  hotkeyCollisions,
  hotkeySettingsChanged,
  isHotkeyActive,
  isMouseAccelerator,
  hotkeyReservedByPtt,
  isPttReserved,
  isSideMouseButton,
  isValidAccelerator,
  parseMouseAccelerator,
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

describe('hotkeySettingsChanged', () => {
  it('no re-registra atajos al cambiar solo la visibilidad del overlay', () => {
    expect(
      hotkeySettingsChanged(DEFAULT_CAPTURE_SETTINGS, {
        ...DEFAULT_CAPTURE_SETTINGS,
        perfOverlayVisible: false,
      }),
    ).toBe(false);
  });

  it('re-registra al cambiar una combinación o el interruptor que habilita una acción', () => {
    expect(
      hotkeySettingsChanged(DEFAULT_CAPTURE_SETTINGS, {
        ...DEFAULT_CAPTURE_SETTINGS,
        perfOverlayHotkey: 'Alt+P',
      }),
    ).toBe(true);
    expect(
      hotkeySettingsChanged(DEFAULT_CAPTURE_SETTINGS, {
        ...DEFAULT_CAPTURE_SETTINGS,
        perfOverlayEnabled: true,
      }),
    ).toBe(true);
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

  it('con el PTT en un botón del ratón, ese botón suelto queda reservado', () => {
    expect(isPttReserved('Mouse4', 'Mouse4')).toBe(true);
    expect(isPttReserved('Ctrl+Mouse4', 'Mouse4')).toBe(false);
    expect(isPttReserved('Mouse5', 'Mouse4')).toBe(false);
    expect(isPttReserved('F9', 'Mouse4')).toBe(false);
  });
});

describe('hotkeyReservedByPtt (auditoría C: C1-BUG-1)', () => {
  it('devuelve la acción cuyo atajo es la misma pulsación que la tecla del PTT', () => {
    expect(hotkeyReservedByPtt(DEFAULT_CAPTURE_SETTINGS, 'F8')?.key).toBe('replayHotkey');
    expect(hotkeyReservedByPtt(DEFAULT_CAPTURE_SETTINGS, 'F7')?.key).toBe('recordingHotkey');
    expect(hotkeyReservedByPtt(DEFAULT_CAPTURE_SETTINGS, 'F9')).toBeNull(); // el PTT por defecto
  });

  it('una combinación con esa tecla no choca, y un botón del ratón sí', () => {
    const s = { ...DEFAULT_CAPTURE_SETTINGS, replayHotkey: 'Ctrl+F8', screenshotHotkey: 'Mouse4' };
    expect(hotkeyReservedByPtt(s, 'F8')).toBeNull();
    expect(hotkeyReservedByPtt(s, 'Mouse4')?.key).toBe('screenshotHotkey');
  });

  it('cuenta también las acciones apagadas: encenderlas luego no puede crear el choque', () => {
    const s = { ...DEFAULT_CAPTURE_SETTINGS, perfOverlayEnabled: false, perfOverlayHotkey: 'F11' };
    expect(hotkeyReservedByPtt(s, 'F11')?.key).toBe('perfOverlayHotkey');
  });

  it('sin segundo argumento usa la tecla de PTT de los ajustes', () => {
    expect(hotkeyReservedByPtt({ ...DEFAULT_CAPTURE_SETTINGS, pttHotkey: 'F6' })?.key).toBe(
      'screenshotHotkey',
    );
  });
});

/** Botón del ratón sin modificadores; los tests activan los que necesiten. */
function click(button: number, partial: Partial<MousePress> = {}): MousePress {
  return { button, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...partial };
}

describe('accelFromMousePress', () => {
  it('los botones laterales del DOM (3 atrás, 4 adelante) son Mouse4 y Mouse5', () => {
    expect(accelFromMousePress(click(3))).toBe('Mouse4');
    expect(accelFromMousePress(click(4))).toBe('Mouse5');
  });

  it('lleva los modificadores en el orden de Electron', () => {
    expect(accelFromMousePress(click(3, { ctrlKey: true }))).toBe('Ctrl+Mouse4');
    expect(accelFromMousePress(click(4, { shiftKey: true, altKey: true, ctrlKey: true }))).toBe(
      'Ctrl+Alt+Shift+Mouse5',
    );
  });

  it('izquierdo, central y derecho no son atajos', () => {
    for (const boton of [0, 1, 2]) {
      expect(accelFromMousePress(click(boton))).toBeNull();
      expect(isSideMouseButton(boton)).toBe(false);
    }
    expect(isSideMouseButton(3)).toBe(true);
    expect(isSideMouseButton(4)).toBe(true);
  });
});

describe('aceleradores de ratón', () => {
  it('son válidos, solos o con modificadores', () => {
    expect(isValidAccelerator('Mouse4')).toBe(true);
    expect(isValidAccelerator('Ctrl+Shift+Mouse5')).toBe(true);
    expect(isValidAccelerator('Mouse3')).toBe(false);
    expect(isValidAccelerator('Ctrl+Ctrl+Mouse4')).toBe(false);
  });

  it('se despiezan con la numeración de libuiohook (4/5) y modificadores exactos', () => {
    expect(parseMouseAccelerator('Mouse4')).toEqual({
      button: 4,
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    });
    expect(parseMouseAccelerator('Ctrl+Super+Mouse5')).toEqual({
      button: 5,
      ctrl: true,
      alt: false,
      shift: false,
      meta: true,
    });
  });

  it('una tecla no es acelerador de ratón (va por globalShortcut)', () => {
    expect(isMouseAccelerator('Mouse4')).toBe(true);
    expect(isMouseAccelerator('Alt+Mouse5')).toBe(true);
    expect(isMouseAccelerator('F8')).toBe(false);
    expect(isMouseAccelerator('Ctrl+M')).toBe(false);
    expect(parseMouseAccelerator('F8')).toBeNull();
    expect(parseMouseAccelerator('Mouse6')).toBeNull();
  });

  it('dos acciones en el mismo botón chocan', () => {
    const s = { ...DEFAULT_CAPTURE_SETTINGS, replayHotkey: 'Mouse4', recordingHotkey: 'Mouse4' };
    expect(hotkeyCollisions(s)).toEqual([['replayHotkey', 'recordingHotkey']]);
    const distintos = { ...s, recordingHotkey: 'Ctrl+Mouse4' };
    expect(hotkeyCollisions(distintos)).toEqual([]);
  });
});
