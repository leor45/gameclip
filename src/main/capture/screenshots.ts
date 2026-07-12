import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { targetPathFor } from './relocate';

/**
 * Captura el monitor configurado a un PNG en la carpeta del juego:
 * `<outputDir>/<Juego|Desktop>/Capturas/<Juego> Screenshot <marca>.png`. Usa desktopCapturer a la
 * resolución nativa del display (scaleFactor incluido) y guarda `nativeImage.toPNG()`.
 * Best-effort: cualquier fallo (o thumbnail vacío por fullscreen exclusivo) devuelve null.
 */
export async function takeScreenshot(
  monitorIndex: number,
  outputDir: string,
  gameName: string | null = null,
): Promise<string | null> {
  try {
    // require diferido: en tests unitarios no se puede cargar electron.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { desktopCapturer, screen } = require('electron') as typeof import('electron');
    const displays = screen.getAllDisplays();
    const display = displays[monitorIndex] ?? screen.getPrimaryDisplay();
    const width = Math.round(display.size.width * display.scaleFactor);
    const height = Math.round(display.size.height * display.scaleFactor);

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
    });
    // display_id de desktopCapturer ↔ id de screen; si no matchea, cae al orden.
    const source =
      sources.find((s) => Number(s.display_id) === display.id) ??
      sources[monitorIndex] ??
      sources[0];
    if (!source) return null;

    const png = source.thumbnail.toPNG();
    if (!png || png.length === 0) return null; // fullscreen exclusivo puede dar una imagen vacía

    const filePath = targetPathFor({
      outputDir,
      gameName,
      date: new Date(),
      kind: 'screenshot',
      extension: 'png',
    });
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, png);
    return filePath;
  } catch {
    return null;
  }
}
