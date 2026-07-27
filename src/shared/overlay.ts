// Contenido del aviso que el overlay muestra al detectarse un juego. Puro: lo arma el main (el
// overlay es una ventana aparte y no puede leer los ajustes) y se testea sin Electron ni libobs.

import type { CaptureSettings } from './capture';
import type { OverlayState } from './ipc';

/** Las dos esquinas del overlay: avisos a la izquierda, indicador de grabación a la derecha. */
export type OverlayZone = 'left' | 'right';

/**
 * Qué le toca pintar a cada esquina. El overlay son dos ventanas (una por esquina) y cada una recibe
 * el estado ya filtrado: así la página sigue siendo una vista tonta, sin saber dónde está.
 */
export function overlayStateFor(zone: OverlayZone, state: OverlayState): OverlayState {
  return zone === 'left'
    ? { recording: false, toast: state.toast, notice: state.notice }
    : { recording: state.recording, toast: null, notice: null };
}

/**
 * Esquina superior del work area que le toca a cada zona: los avisos arriba a la izquierda, el REC
 * arriba a la derecha.
 *
 * Es puro y vive aquí (no en `overlay.ts` del main) por lo mismo que `perfWindowPosition`: se calcula
 * en **cada** aparición del overlay, no solo al crear la ventana, y esa es justo la parte que hay que
 * poder testear sin Electron.
 */
export function overlayWindowPosition(
  zone: OverlayZone,
  workArea: { x: number; y: number; width: number; height: number },
  win: { width: number; height: number },
  margin: number,
): { x: number; y: number } {
  return {
    x:
      zone === 'left'
        ? workArea.x + margin
        : workArea.x + workArea.width - win.width - margin,
    y: workArea.y + margin,
  };
}

export interface OverlayHotkey {
  /** Tecla tal como está configurada (F8, Ctrl+F9…). */
  key: string;
  /** Qué hace, en lenguaje natural. */
  label: string;
}

export interface OverlayNotice {
  title: string;
  hotkeys: OverlayHotkey[];
  /** El botón de captura del mando está activo: se anuncia bajo los atajos. */
  controllerCapture: boolean;
}

/**
 * Duración del buffer en lenguaje natural: 60 → "el último minuto"; 90 → "el último minuto y medio";
 * 45 → "los últimos 45 segundos". La barra ya ofrece presets, pero Ajustes admite cualquier valor.
 */
export function describeReplayDuration(seconds: number): string {
  if (seconds < 60) return `los últimos ${seconds} segundos`;
  const minutos = seconds / 60;
  if (minutos === 1) return 'el último minuto';
  if (minutos === 1.5) return 'el último minuto y medio';
  if (Number.isInteger(minutos)) return `los últimos ${minutos} minutos`;
  return `los últimos ${Math.round(seconds)} segundos`;
}

/**
 * Aviso para un juego recién detectado, con las hotkeys **realmente configuradas**. Devuelve null
 * cuando no hay nada que anunciar: con el modo de grabación en `off` no hay clips (y una captura
 * suelta no justifica interrumpir la partida).
 */
export function buildGameNotice(settings: CaptureSettings): OverlayNotice | null {
  if (settings.recordingMode === 'off') return null;

  const hotkeys: OverlayHotkey[] = [];
  if (settings.replayHotkey) {
    hotkeys.push({
      key: settings.replayHotkey,
      label: `Guardar ${describeReplayDuration(settings.replaySeconds)}`,
    });
  }
  if (settings.recordingHotkey) {
    hotkeys.push({ key: settings.recordingHotkey, label: 'Grabar / detener' });
  }
  if (settings.screenshotsEnabled && settings.screenshotHotkey) {
    hotkeys.push({ key: settings.screenshotHotkey, label: 'Guardar una captura' });
  }
  if (!hotkeys.length) return null;

  return {
    title: 'Listo para clipear',
    hotkeys,
    controllerCapture: settings.controllerCaptureEnabled,
  };
}
