// Dominio de los atajos de teclado: catálogo de acciones, captura de la pulsación, validación y
// colisiones. Puro (sin Electron ni DOM): lo comparten el registro global del main y la UI de
// Ajustes, que antes tenían cada uno su propia lista de acciones escrita a mano.

import type { CaptureSettings } from './capture';

/** Claves de `CaptureSettings` que son aceleradores de Electron (el PTT NO: usa otro motor). */
export type HotkeyKey =
  | 'replayHotkey'
  | 'recordingHotkey'
  | 'screenshotHotkey'
  | 'gameSwitchHotkey'
  | 'perfOverlayHotkey';

export interface HotkeyAction {
  key: HotkeyKey;
  label: string;
  description: string;
  /** Interruptor de `CaptureSettings` que la habilita, si tiene uno. */
  enabledBy?: 'screenshotsEnabled' | 'gameSwitchEnabled' | 'perfOverlayEnabled';
  /** true si además exige que el modo de grabación no esté apagado. */
  needsRecording?: boolean;
}

/**
 * Catálogo de acciones con atajo: única fuente de verdad. La UI pinta una fila por entrada y el main
 * registra un `globalShortcut` por entrada, así que añadir un atajo es añadir aquí una línea.
 */
export const HOTKEY_ACTIONS: readonly HotkeyAction[] = [
  {
    key: 'replayHotkey',
    label: 'Guardar clip',
    description: 'Guarda los últimos segundos ya grabados, según la duración del buffer.',
    needsRecording: true,
  },
  {
    key: 'recordingHotkey',
    label: 'Grabar / detener',
    description: 'Empieza una grabación normal; pulsado de nuevo, la corta y guarda el clip.',
    needsRecording: true,
  },
  {
    key: 'screenshotHotkey',
    label: 'Captura de pantalla',
    description: 'Guarda un PNG del monitor de grabación.',
    enabledBy: 'screenshotsEnabled',
  },
  {
    key: 'gameSwitchHotkey',
    label: 'Cambiar de juego',
    description: 'Rota el juego activo entre los juegos en ejecución.',
    enabledBy: 'gameSwitchEnabled',
  },
  {
    key: 'perfOverlayHotkey',
    label: 'Mostrar/ocultar overlay de rendimiento',
    description: 'Alterna la visibilidad del overlay de rendimiento sin cambiar su configuración.',
    enabledBy: 'perfOverlayEnabled',
  },
];

/** ¿La acción está activa con estos ajustes? (si no, su atajo no se registra) */
export function isHotkeyActive(action: HotkeyAction, settings: CaptureSettings): boolean {
  if (action.needsRecording && settings.recordingMode === 'off') return false;
  if (action.enabledBy && !settings[action.enabledBy]) return false;
  return true;
}

/** Campos que cambian qué aceleradores globales están registrados. */
const HOTKEY_SETTING_KEYS = [
  'replayHotkey',
  'recordingHotkey',
  'recordingMode',
  'screenshotHotkey',
  'screenshotsEnabled',
  'gameSwitchHotkey',
  'gameSwitchEnabled',
  'perfOverlayHotkey',
  'perfOverlayEnabled',
] as const;

/** Evita desregistrar/re-registrar una tecla que todavía está físicamente pulsada. */
export function hotkeySettingsChanged(before: CaptureSettings, after: CaptureSettings): boolean {
  return HOTKEY_SETTING_KEYS.some((key) => before[key] !== after[key]);
}

// Modificadores en el orden canónico de Electron.
const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Super'] as const;

/** Teclas base aceptadas (las que Electron registra de forma fiable en Windows). */
const BASE_KEYS = new Set<string>([
  ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  ...'0123456789'.split(''),
  'Space',
  'Tab',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Up',
  'Down',
  'Left',
  'Right',
  'Plus',
  'Minus',
]);

/** Pulsación del teclado, ya despiezada (el DOM se queda en el renderer). */
export interface KeyPress {
  /** `KeyboardEvent.key`. */
  key: string;
  /** `KeyboardEvent.code` (independiente de la distribución: 'KeyC', 'F8', 'Digit4'…). */
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const F_KEY = /^F([1-9]|1[0-9]|2[0-4])$/;

/** Tecla base de una pulsación, en el nombre que entiende Electron; null si no es una tecla base. */
function baseKeyOf(press: KeyPress): string | null {
  const { code, key } = press;
  // Las F van por `code`, pero no todos los entornos lo rellenan: para ellas `key` vale lo mismo.
  if (F_KEY.test(code) || F_KEY.test(key)) return F_KEY.test(code) ? code : key;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `num${code.slice(6)}`;
  const porCode: Record<string, string> = {
    Space: 'Space',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Equal: 'Plus',
    NumpadAdd: 'Plus',
    NumpadSubtract: 'Minus',
  };
  if (porCode[code]) return porCode[code];
  // Fallback por `key` para distribuciones raras: solo una letra o dígito sueltos.
  if (/^[a-zA-Z0-9]$/.test(key)) return key.toUpperCase();
  return null;
}

/**
 * Acelerador a partir de una pulsación. Devuelve null mientras solo haya modificadores (el botón
 * sigue "a la escucha" hasta que llegue la tecla base) y también con teclas que Electron no
 * registra: mejor rechazarlas al capturar que aceptarlas y que el atajo falle en silencio.
 */
export function accelFromKeyPress(press: KeyPress): string | null {
  const base = baseKeyOf(press);
  if (!base) return null;
  const partes: string[] = [];
  if (press.ctrlKey) partes.push('Ctrl');
  if (press.altKey) partes.push('Alt');
  if (press.shiftKey) partes.push('Shift');
  if (press.metaKey) partes.push('Super');
  partes.push(base);
  return partes.join('+');
}

/** ¿Es un acelerador que Electron acepta? (modificadores válidos + una tecla base soportada) */
export function isValidAccelerator(accel: string): boolean {
  const partes = accel.split('+').map((p) => p.trim());
  const base = partes.pop();
  if (!base) return false;
  const esBase = BASE_KEYS.has(base) || /^num[0-9]$/.test(base);
  if (!esBase) return false;
  const vistos = new Set<string>();
  for (const mod of partes) {
    if (!MODIFIERS.includes(mod as (typeof MODIFIERS)[number])) return false;
    if (vistos.has(mod)) return false;
    vistos.add(mod);
  }
  return true;
}

/**
 * Acciones activas que comparten atajo, agrupadas. Dos acciones con la misma tecla no pueden
 * funcionar las dos: antes el main descartaba la segunda con un warn que nadie veía.
 */
export function hotkeyCollisions(settings: CaptureSettings): HotkeyKey[][] {
  const porTecla = new Map<string, HotkeyKey[]>();
  for (const action of HOTKEY_ACTIONS) {
    if (!isHotkeyActive(action, settings)) continue;
    const accel = settings[action.key].trim();
    if (!accel) continue;
    const clave = accel.toLowerCase();
    porTecla.set(clave, [...(porTecla.get(clave) ?? []), action.key]);
  }
  return [...porTecla.values()].filter((keys) => keys.length > 1);
}

/**
 * ¿El acelerador choca con la tecla del push-to-talk? El PTT corre sobre otro motor (uiohook), pero
 * es la MISMA tecla física: con `F9` de PTT, un atajo `F9` dispararía las dos cosas a la vez.
 * Reservada aunque el PTT esté apagado, para que encenderlo luego no rompa un atajo ya guardado.
 * Solo choca la tecla suelta: `Ctrl+F9` es otra pulsación, y `Mouse4/5` no son aceleradores.
 */
export function isPttReserved(accel: string, pttHotkey: string): boolean {
  const ptt = pttHotkey.trim();
  if (!ptt || ptt.startsWith('Mouse')) return false;
  return accel.trim().toLowerCase() === ptt.toLowerCase();
}
