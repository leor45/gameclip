import { describe, expect, it } from 'vitest';
import { loginItemSettings } from '../auto-launch';

const EXEC = 'C:\\Users\\Leo\\AppData\\Local\\Temp\\GameClip-0.7.0\\GameClip.exe';
const PORTABLE = 'D:\\Descargas\\GameClip-0.7.0-portable.exe';

describe('loginItemSettings', () => {
  // REGRESIÓN: el bug registraba `process.execPath`, que en el portable es la copia extraída en
  // %TEMP% (efímera). Windows apuntaba a un ejecutable fantasma y la app nunca arrancaba. El
  // launcher portable expone la ruta real en PORTABLE_EXECUTABLE_FILE: hay que registrar esa.
  it('en portable usa PORTABLE_EXECUTABLE_FILE como path, no el execPath temporal', () => {
    const s = loginItemSettings(true, { PORTABLE_EXECUTABLE_FILE: PORTABLE }, EXEC);
    expect(s.path).toBe(PORTABLE);
    expect(s.path).not.toBe(EXEC);
  });

  it('sin PORTABLE_EXECUTABLE_FILE cae a execPath (build no portable)', () => {
    const s = loginItemSettings(true, {}, EXEC);
    expect(s.path).toBe(EXEC);
  });

  it('siempre arranca oculto (bandeja) y refleja el ajuste en openAtLogin', () => {
    const on = loginItemSettings(true, {}, EXEC);
    expect(on.args).toContain('--hidden');
    expect(on.openAtLogin).toBe(true);

    const off = loginItemSettings(false, { PORTABLE_EXECUTABLE_FILE: PORTABLE }, EXEC);
    expect(off.openAtLogin).toBe(false);
    expect(off.args).toContain('--hidden');
  });
});
