import type { CaptureManager } from '../capture/manager';
import type { LibraryManager } from './manager';

/** Lo que la biblioteca necesita de la captura y del catálogo cuando se guardan los ajustes. */
export interface SettingsSyncDeps {
  library: Pick<LibraryManager, 'reconcile' | 'relabelGames'>;
  capture: Pick<CaptureManager, 'outputDir' | 'getStatus'>;
  /** Auto-borrado por límite de almacenamiento (asíncrono; registra sus propios errores). */
  aplicarLimite: () => void;
}

/**
 * Lo que hace la biblioteca cada vez que se guardan los ajustes: escanear la carpeta (pudo cambiar),
 * re-etiquetar (el owner pudo renombrar un juego) y aplicar el límite (pudo bajarlo).
 *
 * **Nunca lanza.** Corre dentro del `emit('settings')` de `CaptureManager.setSettings`: una excepción
 * aquí abortaba el guardado antes del rebuild del pipeline (y el resto de listeners de 'settings').
 * Cada paso va aislado: que falle el escaneo no impide aplicar un límite recién bajado.
 *
 * **Grabando no se escanea.** libobs escribe la grabación en la RAÍZ de la carpeta y la captura la
 * mueve a `<Juego|Desktop>/` al pararla: escanear a mitad catalogaba el MP4 a medio escribir como
 * `scan` y, tras la reubicación, quedaba una fila fantasma con la ruta vieja y un tamaño parcial que el
 * límite contaba. El re-etiquetado y el límite sí corren: solo tocan clips ya catalogados, y la
 * grabación en curso no lo está (se registra al pararla, por 'clip-saved').
 */
export function syncLibraryAfterSettings({
  library,
  capture,
  aplicarLimite,
}: SettingsSyncDeps): void {
  try {
    const outputDir = capture.outputDir();
    if (capture.getStatus().state !== 'recording') {
      aislado('escanear la carpeta de clips', () => library.reconcile(outputDir));
    }
    aislado('re-etiquetar los juegos', () => library.relabelGames(outputDir));
    aislado('aplicar el límite de almacenamiento', aplicarLimite);
  } catch (err) {
    console.error('[library] sincronizar tras guardar los ajustes falló:', err);
  }
}

function aislado(paso: string, fn: () => unknown): void {
  try {
    fn();
  } catch (err) {
    console.error(`[library] ${paso} tras guardar los ajustes falló:`, err);
  }
}
