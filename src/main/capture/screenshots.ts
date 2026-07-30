import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ScreenshotResult } from '../../shared/screenshot';
import { targetPathFor } from './relocate';
import { pickScreenshotSource, resolveTargetDisplay } from './screenshot-target';

/**
 * Captura el **monitor completo** configurado a un PNG en la carpeta del juego:
 * `<outputDir>/<Juego|Desktop>/Capturas/<Juego> Screenshot <marca>.png`. Usa desktopCapturer a la
 * resolución nativa del display (scaleFactor incluido) y guarda `nativeImage.toPNG()`.
 *
 * Si el monitor pedido no se puede capturar, **falla con el motivo**: nunca guarda la imagen de otro
 * monitor. Ver `pickScreenshotSource` y spec/work/feature-screenshots-monitor-y-hdr.
 */
export async function takeScreenshot(
  monitorIndex: number,
  outputDir: string,
  gameName: string | null = null,
): Promise<ScreenshotResult> {
  try {
    // require diferido: en tests unitarios no se puede cargar electron.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { desktopCapturer, screen } = require('electron') as typeof import('electron');
    const displays = screen.getAllDisplays();
    const fisico = (d: Electron.Display) => ({
      id: d.id,
      width: Math.round(d.size.width * d.scaleFactor),
      height: Math.round(d.size.height * d.scaleFactor),
    });

    const fisicos = displays.map(fisico);
    const primaryId = screen.getPrimaryDisplay().id;

    // Primero el monitor objetivo: su tamaño nativo es el thumbnailSize que hay que pedir para que
    // la captura salga a resolución completa.
    const objetivo = resolveTargetDisplay({ displays: fisicos, primaryId, monitorIndex });
    if (!objetivo.ok) return objetivo;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: objetivo.display.width, height: objetivo.display.height },
    });

    const elegida = pickScreenshotSource({
      displays: fisicos,
      primaryId,
      monitorIndex,
      sources: sources.map((s) => {
        const { width, height } = s.thumbnail.getSize();
        return { display_id: s.display_id, width, height };
      }),
    });
    if (!elegida.ok) return elegida;

    const png = sources[elegida.sourceIndex]!.thumbnail.toPNG();
    // Fullscreen exclusivo puede dar una imagen vacía: el juego se queda la swapchain del monitor
    // y la composición del escritorio no tiene nada que entregar.
    if (!png || png.length === 0) return { ok: false, reason: 'captura-vacia' };

    const filePath = targetPathFor({
      outputDir,
      gameName,
      date: new Date(),
      kind: 'screenshot',
      extension: 'png',
    });
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, png);
    return { ok: true, path: filePath };
  } catch (err) {
    console.error('[screenshots] fallo al capturar:', err);
    return { ok: false, reason: 'error' };
  }
}
