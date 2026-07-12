/**
 * Cierre ordenado de la app.
 *
 * Vive fuera de `index.ts` para poder testearlo: montar un `app.on('will-quit')` en un test exigiría
 * Electron entero. El orden **no es cosmético**, es la causa del bug de `fix/tray-destruida-al-cerrar`:
 * `CaptureManager.shutdown()` no es silencioso —emite un `status` final (idle)— y ese evento lo
 * escuchan la bandeja y el overlay. Si se destruyen antes, el status le pega a un `Tray` muerto y
 * Electron muestra "Tray is destroyed" como excepción no controlada.
 *
 * Regla: **primero se apaga lo que emite, después se destruye lo que escucha.**
 */

export interface PartesDelCierre {
  unregisterHotkeys: () => void;
  pushToTalk: { stop(): void };
  clearTimers: () => void;
  detector: { stop(): void } | null;
  /** Al apagarse emite un `status` final; sus oyentes tienen que seguir vivos. */
  capture: { shutdown(): void } | null;
  overlay: { destroy(): void } | null;
  tray: { destroy(): void } | null;
  api: { close(): void } | null;
}

export function teardown(partes: PartesDelCierre): void {
  const pasos: Array<[string, () => void]> = [
    // Emisores: se callan primero, para que nadie genere eventos durante el cierre.
    ['hotkeys', () => partes.unregisterHotkeys()],
    ['push-to-talk', () => partes.pushToTalk.stop()],
    ['timers', () => partes.clearTimers()],
    ['detector de juegos', () => partes.detector?.stop()],
    ['captura', () => partes.capture?.shutdown()],
    // Oyentes: recién ahora, cuando ya nadie les va a hablar.
    ['overlay', () => partes.overlay?.destroy()],
    ['bandeja', () => partes.tray?.destroy()],
    ['api', () => partes.api?.close()],
  ];

  // Cada paso es independiente: si uno falla, el cierre TERMINA igual. Si no, una excepción a mitad
  // de camino dejaría libobs corriendo y el puerto de la API tomado — que es lo que pasaba.
  for (const [nombre, paso] of pasos) {
    try {
      paso();
    } catch (err) {
      console.error(`[cierre] '${nombre}' falló:`, err);
    }
  }
}
