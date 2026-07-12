import { describe, expect, it } from 'vitest';
import { targetPathFor } from '../capture/relocate';

// `takeScreenshot` depende de Electron (desktopCapturer) y se verifica en el selftest E2E; aquí
// se fija DÓNDE escribe: la ruta la calcula `targetPathFor`, que es puro.
describe('ruta de las capturas de pantalla', () => {
  it('van a la subcarpeta Capturas del juego, con Screenshot en el nombre', () => {
    const ruta = targetPathFor({
      outputDir: 'D:\\Clips',
      gameName: 'Terraria',
      date: new Date(2025, 11, 22, 20, 47, 50, 780),
      kind: 'screenshot',
      extension: 'png',
    });

    expect(ruta).toBe(
      'D:\\Clips\\Terraria\\Capturas\\Terraria Screenshot 2025.12.22 - 20.47.50.78.png',
    );
    expect(ruta).not.toContain(':\\Clips\\Capturas'); // ya no hay Capturas/ suelto en la raíz
  });

  it('sin juego, la captura va a Desktop/Capturas', () => {
    expect(
      targetPathFor({
        outputDir: 'D:\\Clips',
        gameName: null,
        date: new Date(2026, 6, 9, 8, 5, 3, 40),
        kind: 'screenshot',
        extension: 'png',
      }),
    ).toBe('D:\\Clips\\Desktop\\Capturas\\Desktop Screenshot 2026.07.09 - 08.05.03.04.png');
  });
});
