// Overlay de rendimiento: configuración visual, posicionamiento por sliders (estilo NVIDIA App)
// y snapshot de métricas. Puro (sin Electron): lo comparten el main, la página del overlay y la UI
// de Ajustes, y se testea sin ventanas.

/** Métricas que el overlay sabe mostrar; cada una con su check en Ajustes. */
export const PERF_METRIC_KEYS = [
  'fps',
  'gpuUsage',
  'gpuTemp',
  'gpuFan',
  'gpuVoltage',
  'vram',
  'cpuUsage',
  'cpuTemp',
  'ram',
] as const;

export type PerfMetricKey = (typeof PERF_METRIC_KEYS)[number];

export type PerfMetricsEnabled = Record<PerfMetricKey, boolean>;

/** 'horizontal': todo en una línea (apaisado) · 'vertical': una métrica por línea (desglosado). */
export type PerfLayout = 'horizontal' | 'vertical';

/** Tamaño de fuente del overlay (preset de tres). */
export type PerfFontSize = 'small' | 'standard' | 'large';

export const PERF_FONT_SIZES: readonly PerfFontSize[] = ['small', 'standard', 'large'];

/** Configuración visual del overlay de rendimiento (posición, disposición, color, métricas). */
export interface PerfOverlayConfig {
  metrics: PerfMetricsEnabled;
  /** Posición horizontal 0–100 a lo largo del borde (slider). */
  posX: number;
  /** Posición vertical 0–100 (slider). */
  posY: number;
  layout: PerfLayout;
  fontSize: PerfFontSize;
  /** Color del texto, hex #RRGGBB. */
  textColor: string;
  /** Opacidad del fondo 0–100. */
  bgOpacity: number;
}

export const DEFAULT_PERF_OVERLAY: PerfOverlayConfig = {
  metrics: {
    fps: true,
    gpuUsage: true,
    gpuTemp: false,
    gpuFan: false,
    gpuVoltage: false,
    vram: false,
    cpuUsage: true,
    cpuTemp: false,
    ram: false,
  },
  posX: 0,
  posY: 0,
  layout: 'vertical',
  fontSize: 'standard',
  textColor: '#FFFFFF',
  bgOpacity: 40,
};

/**
 * Las 8 posiciones con nombre (como NVIDIA App): tres arriba, dos al medio (nunca el centro de la
 * pantalla) y tres abajo. El orden es el de las flechas del selector.
 */
export const PERF_PRESETS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;

export type PerfPreset = (typeof PERF_PRESETS)[number];

export const PERF_PRESET_LABELS: Record<PerfPreset, string> = {
  'top-left': 'Parte superior izquierda',
  'top-center': 'Parte superior central',
  'top-right': 'Parte superior derecha',
  'middle-left': 'Parte central izquierda',
  'middle-right': 'Parte central derecha',
  'bottom-left': 'Parte inferior izquierda',
  'bottom-center': 'Parte inferior central',
  'bottom-right': 'Parte inferior derecha',
};

// Bandas de los sliders: ≤33 es izquierda/arriba, ≥67 derecha/abajo, el resto banda central.
const BANDA_BAJA = 33;
const BANDA_ALTA = 67;

function clamp0a100(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Posición válida a partir de los sliders: entera, 0–100 y **nunca el centro de la pantalla**. Si
 * las dos coordenadas caen en la banda central, la horizontal se pega al borde más cercano de su
 * banda (como NVIDIA App, que ofrece "parte central izquierda/derecha" pero no centro-centro).
 */
export function clampPerfPosition(posX: number, posY: number): { posX: number; posY: number } {
  let x = clamp0a100(Number.isFinite(posX) ? posX : 0);
  const y = clamp0a100(Number.isFinite(posY) ? posY : 0);
  const xCentro = x > BANDA_BAJA && x < BANDA_ALTA;
  const yCentro = y > BANDA_BAJA && y < BANDA_ALTA;
  if (xCentro && yCentro) x = x < 50 ? BANDA_BAJA : BANDA_ALTA;
  return { posX: x, posY: y };
}

/** Preset (con nombre) al que corresponde una posición de sliders. */
export function presetFor(posX: number, posY: number): PerfPreset {
  const { posX: x, posY: y } = clampPerfPosition(posX, posY);
  const fila = y <= BANDA_BAJA ? 'top' : y >= BANDA_ALTA ? 'bottom' : 'middle';
  if (fila === 'middle') return x < 50 ? 'middle-left' : 'middle-right';
  const columna = x <= BANDA_BAJA ? 'left' : x >= BANDA_ALTA ? 'right' : 'center';
  return `${fila}-${columna}` as PerfPreset;
}

/** Sliders canónicos de un preset (0 · 50 · 100), para cuando se elige con las flechas. */
export function positionForPreset(preset: PerfPreset): { posX: number; posY: number } {
  const [fila, columna] = preset.split('-') as [string, string];
  return {
    posX: columna === 'left' ? 0 : columna === 'right' ? 100 : 50,
    posY: fila === 'top' ? 0 : fila === 'bottom' ? 100 : 50,
  };
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Acepta un parcial de origen no confiable (disco/IPC) y devuelve una config válida. */
export function normalizePerfOverlay(input: unknown): PerfOverlayConfig {
  const d = DEFAULT_PERF_OVERLAY;
  if (typeof input !== 'object' || input === null) {
    return { ...d, metrics: { ...d.metrics } };
  }
  const raw = input as Record<string, unknown>;
  const rawMetrics =
    typeof raw.metrics === 'object' && raw.metrics !== null
      ? (raw.metrics as Record<string, unknown>)
      : {};
  const metrics = Object.fromEntries(
    PERF_METRIC_KEYS.map((key) => [key, bool(rawMetrics[key], d.metrics[key])]),
  ) as PerfMetricsEnabled;
  const { posX, posY } = clampPerfPosition(
    typeof raw.posX === 'number' ? raw.posX : d.posX,
    typeof raw.posY === 'number' ? raw.posY : d.posY,
  );
  return {
    metrics,
    posX,
    posY,
    layout: raw.layout === 'horizontal' || raw.layout === 'vertical' ? raw.layout : d.layout,
    fontSize: PERF_FONT_SIZES.includes(raw.fontSize as PerfFontSize)
      ? (raw.fontSize as PerfFontSize)
      : d.fontSize,
    textColor:
      typeof raw.textColor === 'string' && HEX_COLOR.test(raw.textColor.trim())
        ? raw.textColor.trim().toUpperCase()
        : d.textColor,
    bgOpacity:
      typeof raw.bgOpacity === 'number' && Number.isFinite(raw.bgOpacity)
        ? clamp0a100(raw.bgOpacity)
        : d.bgOpacity,
  };
}

/**
 * Snapshot de métricas que el main empuja a la página del overlay cada segundo. `null` significa
 * «no disponible» (sensor inexistente, helper caído o sin permisos): la página pinta `—`.
 */
export interface PerfSnapshot {
  fps: number | null;
  /** Uso de GPU 0–100. */
  gpuUsage: number | null;
  /** Temperatura de GPU en °C. */
  gpuTemp: number | null;
  /** Velocidad de los fans de la GPU en RPM. */
  gpuFan: number | null;
  /** Voltaje de la GPU en V. */
  gpuVoltage: number | null;
  vramUsedMb: number | null;
  vramTotalMb: number | null;
  /** Uso de CPU 0–100. */
  cpuUsage: number | null;
  /** Temperatura de CPU en °C. */
  cpuTemp: number | null;
  ramUsedMb: number | null;
  ramTotalMb: number | null;
}

export const EMPTY_PERF_SNAPSHOT: PerfSnapshot = {
  fps: null,
  gpuUsage: null,
  gpuTemp: null,
  gpuFan: null,
  gpuVoltage: null,
  vramUsedMb: null,
  vramTotalMb: null,
  cpuUsage: null,
  cpuTemp: null,
  ramUsedMb: null,
  ramTotalMb: null,
};

/** Línea ya formateada, lista para que la página la pinte tal cual. */
export interface PerfLine {
  key: PerfMetricKey;
  label: string;
  /** Valor con unidad ("144", "63 °C", "7,2 / 16,0 GB") o "—" si no está disponible. */
  value: string;
}

const NO_DISPONIBLE = '—';

function gb(mb: number): string {
  return (mb / 1024).toFixed(1).replace('.', ',');
}

/**
 * Líneas del overlay para las métricas marcadas, en el orden fijo del catálogo. El formato vive
 * aquí (y no en la página) para poder testearlo sin DOM.
 */
export function perfLines(metrics: PerfMetricsEnabled, s: PerfSnapshot): PerfLine[] {
  const todas: Record<PerfMetricKey, PerfLine> = {
    fps: { key: 'fps', label: 'FPS', value: s.fps === null ? NO_DISPONIBLE : String(Math.round(s.fps)) },
    gpuUsage: {
      key: 'gpuUsage',
      label: 'GPU',
      value: s.gpuUsage === null ? NO_DISPONIBLE : `${Math.round(s.gpuUsage)} %`,
    },
    gpuTemp: {
      key: 'gpuTemp',
      label: 'Temp GPU',
      value: s.gpuTemp === null ? NO_DISPONIBLE : `${Math.round(s.gpuTemp)} °C`,
    },
    gpuFan: {
      key: 'gpuFan',
      label: 'Fans GPU',
      value: s.gpuFan === null ? NO_DISPONIBLE : `${Math.round(s.gpuFan)} RPM`,
    },
    gpuVoltage: {
      key: 'gpuVoltage',
      label: 'Voltaje GPU',
      value: s.gpuVoltage === null ? NO_DISPONIBLE : `${s.gpuVoltage.toFixed(3).replace('.', ',')} V`,
    },
    vram: {
      key: 'vram',
      label: 'VRAM',
      value:
        s.vramUsedMb === null || s.vramTotalMb === null
          ? NO_DISPONIBLE
          : `${gb(s.vramUsedMb)} / ${gb(s.vramTotalMb)} GB`,
    },
    cpuUsage: {
      key: 'cpuUsage',
      label: 'CPU',
      value: s.cpuUsage === null ? NO_DISPONIBLE : `${Math.round(s.cpuUsage)} %`,
    },
    cpuTemp: {
      key: 'cpuTemp',
      label: 'Temp CPU',
      value: s.cpuTemp === null ? NO_DISPONIBLE : `${Math.round(s.cpuTemp)} °C`,
    },
    ram: {
      key: 'ram',
      label: 'RAM',
      value: s.ramUsedMb === null ? NO_DISPONIBLE : `${gb(s.ramUsedMb)} GB`,
    },
  };
  return PERF_METRIC_KEYS.filter((key) => metrics[key]).map((key) => todas[key]);
}

/**
 * Posición de la ventana del overlay dentro del work area del monitor: los sliders interpolan a lo
 * largo del espacio libre (con margen), así 0 pega al borde izquierdo/superior y 100 al opuesto.
 */
export function perfWindowPosition(
  posX: number,
  posY: number,
  workArea: { x: number; y: number; width: number; height: number },
  win: { width: number; height: number },
  margin: number,
): { x: number; y: number } {
  const libreX = Math.max(0, workArea.width - win.width - margin * 2);
  const libreY = Math.max(0, workArea.height - win.height - margin * 2);
  const { posX: px, posY: py } = clampPerfPosition(posX, posY);
  return {
    x: Math.round(workArea.x + margin + (libreX * px) / 100),
    y: Math.round(workArea.y + margin + (libreY * py) / 100),
  };
}
