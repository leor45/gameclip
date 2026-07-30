// Resultado de una captura de pantalla. Vive en shared porque el motivo del fallo cruza el IPC:
// lo usa el toast del overlay (main) y la UI (renderer).

/** Por qué no se pudo elegir la fuente del monitor pedido (ver `pickScreenshotSource`). */
export type ScreenshotSourceFailure =
  | 'sin-monitores'
  | 'monitor-ausente'
  | 'monitor-no-capturable'
  | 'fuentes-ambiguas';

export type ScreenshotFailure =
  | ScreenshotSourceFailure
  /** La fuente existía pero devolvió una imagen vacía (juego en fullscreen exclusivo). */
  | 'captura-vacia'
  /** Fallo inesperado (permisos, escritura en disco…). */
  | 'error';

export type ScreenshotResult =
  | { ok: true; path: string }
  | { ok: false; reason: ScreenshotFailure };

/**
 * Mensaje para el usuario. Antes un fallo no decía nada —la hotkey simplemente no hacía nada—, y el
 * caso más común (`monitor-no-capturable`) tiene solución concreta, así que el texto la nombra.
 */
export function screenshotFailureMessage(reason: ScreenshotFailure): string {
  switch (reason) {
    case 'monitor-no-capturable':
      return 'No se pudo capturar el monitor. Si tiene HDR activo, revisa que «Compatibilidad HDR en capturas de pantalla» esté activada en Ajustes → Avanzado.';
    case 'monitor-ausente':
      return 'El monitor elegido para las capturas no está disponible. Revisa Ajustes → Grabación.';
    case 'fuentes-ambiguas':
      return 'No se pudo identificar el monitor a capturar. Elige un monitor concreto en Ajustes → Grabación.';
    case 'captura-vacia':
      return 'La captura salió vacía: el juego puede estar en pantalla completa exclusiva.';
    case 'sin-monitores':
      return 'No se detectó ningún monitor para capturar.';
    case 'error':
      return 'No se pudo guardar la captura.';
  }
}
