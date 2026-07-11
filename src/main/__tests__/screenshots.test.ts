import { describe, expect, it } from 'vitest';
import { screenshotFileName } from '../capture/screenshots';

// Solo se testea el helper puro (nombre/fecha); takeScreenshot depende de Electron y se
// verifica en el selftest E2E.
describe('screenshotFileName', () => {
  it('formatea "Captura AAAA-MM-DD HH-mm-ss.png" con ceros a la izquierda', () => {
    // 2026-07-09 08:05:03 (mes 0-indexado en Date: 6 = julio).
    const fecha = new Date(2026, 6, 9, 8, 5, 3);
    expect(screenshotFileName(fecha)).toBe('Captura 2026-07-09 08-05-03.png');
  });

  it('usa guiones (no ":") para que la ruta valga en Windows', () => {
    const nombre = screenshotFileName(new Date(2026, 11, 31, 23, 59, 59));
    expect(nombre).toBe('Captura 2026-12-31 23-59-59.png');
    expect(nombre).not.toContain(':');
  });
});
