// Preferencias de UI del editor avanzado que se recuerdan entre sesiones (localStorage del renderer,
// igual que la sesión). Por ahora solo el alto del panel inferior (transporte + timeline).

/** Alto mínimo del panel inferior (px). */
export const PANEL_MIN = 140;
/** Alto por defecto del panel inferior (px), cuando no hay nada guardado. */
export const PANEL_DEFAULT = 300;
/** Margen reservado arriba (barra superior + algo de previa) al calcular el alto máximo. */
const PANEL_TOP_MARGIN = 160;

const PANEL_HEIGHT_KEY = 'gameclip.editor.panelHeight';

/** Acota un alto de panel al rango válido `[PANEL_MIN, max]`. No finito → el defecto. */
export function clampPanelHeight(height: number, max: number): number {
  if (!Number.isFinite(height)) return Math.min(max, PANEL_DEFAULT);
  return Math.min(max, Math.max(PANEL_MIN, height));
}

/** Alto máximo del panel según la ventana actual (deja sitio a la barra superior y a la previa). */
export function panelMax(): number {
  return Math.max(PANEL_MIN, window.innerHeight - PANEL_TOP_MARGIN);
}

/**
 * Alto del panel guardado, o `PANEL_DEFAULT` si no hay nada o el valor es inválido. El acotado contra el
 * alto de ventana lo hace el editor con `panelMax()` del momento (la ventana pudo cambiar de tamaño).
 */
export function loadPanelHeight(): number {
  try {
    const raw = localStorage.getItem(PANEL_HEIGHT_KEY);
    if (raw === null) return PANEL_DEFAULT;
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : PANEL_DEFAULT;
  } catch {
    return PANEL_DEFAULT;
  }
}

/** Guarda el alto del panel (best-effort: `localStorage` puede fallar en modo restringido). */
export function savePanelHeight(height: number): void {
  try {
    localStorage.setItem(PANEL_HEIGHT_KEY, String(height));
  } catch {
    // Sin persistencia: el editor sigue funcionando con el valor en memoria.
  }
}
