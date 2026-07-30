import type { ScreenshotResult } from '../../shared/screenshot';
import type { LibraryManager } from '../library/manager';
import type { CaptureManager } from './manager';
import { takeScreenshot } from './screenshots';

/**
 * Toma la captura y la **da de alta en el catálogo**, para que aparezca en la biblioteca sin
 * reiniciar la app (el escaneo solo corre al arrancar y al guardar ajustes). La usan las dos vías
 * que capturan: la hotkey global y el botón de la UI.
 *
 * `source: 'scan'` porque el origen de un PNG no aporta nada — lo que la UI mira es `kind`, que el
 * catálogo deriva de la extensión. Best-effort: si el catálogo no abrió, la captura igual se guarda.
 */
export async function takeAndRegisterScreenshot(
  capture: CaptureManager,
  library: LibraryManager | null,
): Promise<ScreenshotResult> {
  // El monitor de las capturas es su propio ajuste: NO el de grabación de escritorio, que el modal
  // «Grabar escritorio…» reescribe.
  const resultado = await takeScreenshot(
    capture.getSettings().screenshotMonitorIndex,
    capture.outputDir(),
    capture.getStatus().detectedGame, // la carpeta lleva el NOMBRE del juego, no su ejecutable
  );
  if (!resultado.ok) return resultado;

  try {
    await library?.registerSavedClip(resultado.path, 'scan', capture.getStatus().detectedGame);
  } catch (err) {
    console.error('[screenshots] no se pudo catalogar la captura:', err);
  }
  return resultado;
}
