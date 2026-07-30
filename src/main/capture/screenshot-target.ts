// Elección de la fuente de `desktopCapturer` que corresponde al monitor pedido. Puro a propósito:
// es el trozo que causó el bug del monitor equivocado y aquí se puede testear sin Electron.

import { SCREENSHOT_MONITOR_PRIMARY } from '../../shared/capture';
import type { ScreenshotSourceFailure } from '../../shared/screenshot';

/**
 * Motivos, definidos en shared porque cruzan el IPC:
 * - `sin-monitores`: no hay displays (no debería pasar).
 * - `monitor-ausente`: el monitor elegido ya no existe (apagado, desconectado, índice viejo).
 * - `monitor-no-capturable`: el monitor existe pero no está entre las fuentes. Caso típico: HDR
 *   activo — DXGI lo entrega en 10 bits, Chromium lo rechaza y lo saca de la lista.
 * - `fuentes-ambiguas`: capturador sin `display_id` (ruta GDI) y no se puede desambiguar.
 */
export type ScreenshotFailure = ScreenshotSourceFailure;

/** Monitor de `screen.getAllDisplays()`, en píxeles físicos. */
export interface ScreenshotDisplay {
  id: number;
  width: number;
  height: number;
}

/** Fuente de `desktopCapturer.getSources`; `width`/`height` son los del thumbnail. */
export interface ScreenshotSource {
  /** Vacío por la ruta GDI: Chromium solo lo rellena con el capturador DirectX. */
  display_id: string;
  width: number;
  height: number;
}

export type SourcePick =
  | { ok: true; sourceIndex: number }
  | { ok: false; reason: ScreenshotFailure };

export type TargetPick =
  | { ok: true; display: ScreenshotDisplay }
  | { ok: false; reason: ScreenshotFailure };

/**
 * Monitor que toca capturar, **sin** mirar las fuentes. Se resuelve aparte porque su tamaño nativo es
 * el `thumbnailSize` que hay que pedirle a `desktopCapturer`: pedir el de otro monitor perdería
 * resolución (un vertical 1080x1920 metido en 2560x1440 sale a 810x1440).
 */
export function resolveTargetDisplay(input: {
  displays: ScreenshotDisplay[];
  primaryId: number;
  monitorIndex: number;
}): TargetPick {
  const { displays, primaryId, monitorIndex } = input;
  if (displays.length === 0) return { ok: false, reason: 'sin-monitores' };

  // El default sigue al principal de Windows, no a displays[0]: cambiar cuál es el principal no
  // debe obligar a reconfigurar el ajuste.
  const display =
    monitorIndex === SCREENSHOT_MONITOR_PRIMARY
      ? (displays.find((d) => d.id === primaryId) ?? displays[0])
      : displays[monitorIndex];
  return display ? { ok: true, display } : { ok: false, reason: 'monitor-ausente' };
}

/** Margen del aspecto: el thumbnail viene redondeado a píxeles enteros (1080x1920 → 203x360). */
const TOLERANCIA_ASPECTO = 0.02;

/**
 * Fuente que corresponde al monitor pedido, o el motivo por el que no hay ninguna.
 *
 * **Nunca devuelve la fuente de otro monitor.** El bug original caía a
 * `?? sources[monitorIndex] ?? sources[0]` y guardaba una captura del monitor equivocado en silencio;
 * un PNG del monitor que no pediste es peor que no tener captura.
 *
 * Dos rutas, según lo que devuelva Chromium:
 * - **DXGI** (alguna fuente trae `display_id`): match estricto por id.
 * - **GDI** (ninguna lo trae, es lo que pasa con `--disable-features=DirectXCapturer`): por posición
 *   —Chromium y el módulo `screen` enumeran ambos con `EnumDisplayMonitors`— validando el aspecto, y
 *   si no cuadra se busca una única fuente compatible. Si sigue habiendo duda, falla.
 */
export function pickScreenshotSource(input: {
  /** En el orden de `screen.getAllDisplays()`. */
  displays: ScreenshotDisplay[];
  primaryId: number;
  /** `SCREENSHOT_MONITOR_PRIMARY` (-1) = seguir al principal. */
  monitorIndex: number;
  sources: ScreenshotSource[];
}): SourcePick {
  const { displays, primaryId, monitorIndex, sources } = input;
  const objetivoPick = resolveTargetDisplay({ displays, primaryId, monitorIndex });
  if (!objetivoPick.ok) return objetivoPick;
  const target = objetivoPick.display;

  // Ruta DXGI: el id es identidad real, así que el match es estricto y no hay nada que adivinar.
  if (sources.some((s) => s.display_id !== '')) {
    const index = sources.findIndex((s) => Number(s.display_id) === target.id);
    return index >= 0 ? { ok: true, sourceIndex: index } : { ok: false, reason: 'monitor-no-capturable' };
  }

  if (sources.length === 0) return { ok: false, reason: 'monitor-no-capturable' };

  // Ruta GDI. Si las cantidades no coinciden, el orden ya no representa a los displays: no se adivina.
  if (sources.length !== displays.length) return { ok: false, reason: 'fuentes-ambiguas' };

  const aspecto = (w: number, h: number) => w / h;
  const objetivo = aspecto(target.width, target.height);
  const encaja = (s: ScreenshotSource) =>
    Math.abs(aspecto(s.width, s.height) - objetivo) <= objetivo * TOLERANCIA_ASPECTO;

  const porPosicion = displays.indexOf(target);
  if (encaja(sources[porPosicion]!)) return { ok: true, sourceIndex: porPosicion };

  // La posición no cuadró: solo vale si UNA sola fuente tiene el aspecto del monitor pedido.
  const compatibles = sources
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => encaja(s));
  if (compatibles.length === 1) return { ok: true, sourceIndex: compatibles[0]!.i };
  return { ok: false, reason: 'fuentes-ambiguas' };
}
