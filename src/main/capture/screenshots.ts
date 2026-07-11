import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Dos dígitos con cero a la izquierda. */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Nombre de archivo de una captura: "Captura AAAA-MM-DD HH-mm-ss.png" (helper puro,
 * testeable sin Electron; los ':' no valen en rutas de Windows, de ahí los guiones).
 */
export function screenshotFileName(date: Date): string {
  const fecha = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const hora = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `Captura ${fecha} ${hora}.png`;
}

/**
 * Captura el monitor configurado a un PNG en `<outputDir>/Capturas`. Usa desktopCapturer a
 * la resolución nativa del display (scaleFactor incluido) y guarda `nativeImage.toPNG()`.
 * Best-effort: cualquier fallo (o thumbnail vacío por fullscreen exclusivo) devuelve null.
 */
export async function takeScreenshot(
  monitorIndex: number,
  outputDir: string,
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

    const dir = join(outputDir, 'Capturas');
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, screenshotFileName(new Date()));
    await writeFile(filePath, png);
    return filePath;
  } catch {
    return null;
  }
}
