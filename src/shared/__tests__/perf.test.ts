import { describe, expect, it } from 'vitest';
import { DEFAULT_CAPTURE_SETTINGS, normalizeCaptureSettings } from '../capture';
import {
  DEFAULT_PERF_OVERLAY,
  EMPTY_PERF_SNAPSHOT,
  PERF_PRESETS,
  clampPerfPosition,
  normalizePerfOverlay,
  perfLines,
  perfWindowPosition,
  positionForPreset,
  presetFor,
} from '../perf';

describe('clampPerfPosition', () => {
  it('acota a 0–100 y redondea', () => {
    expect(clampPerfPosition(-5, 260)).toEqual({ posX: 0, posY: 100 });
    expect(clampPerfPosition(50.4, 12.7)).toEqual({ posX: 50, posY: 13 });
  });

  it('nunca deja el centro-centro: la horizontal se pega al borde de su banda', () => {
    expect(clampPerfPosition(45, 50)).toEqual({ posX: 33, posY: 50 });
    expect(clampPerfPosition(55, 50)).toEqual({ posX: 67, posY: 50 });
  });

  it('la banda central vertical con horizontal en borde queda intacta', () => {
    expect(clampPerfPosition(0, 50)).toEqual({ posX: 0, posY: 50 });
    expect(clampPerfPosition(100, 44)).toEqual({ posX: 100, posY: 44 });
  });

  it('input no numérico cae a 0', () => {
    expect(clampPerfPosition(Number.NaN, Number.POSITIVE_INFINITY).posX).toBe(0);
  });
});

describe('presetFor', () => {
  it('resuelve las 8 zonas', () => {
    expect(presetFor(0, 0)).toBe('top-left');
    expect(presetFor(50, 0)).toBe('top-center');
    expect(presetFor(100, 0)).toBe('top-right');
    expect(presetFor(0, 50)).toBe('middle-left');
    expect(presetFor(100, 50)).toBe('middle-right');
    expect(presetFor(0, 100)).toBe('bottom-left');
    expect(presetFor(50, 100)).toBe('bottom-center');
    expect(presetFor(100, 100)).toBe('bottom-right');
  });

  it('en los bordes de banda decide igual que el clamp', () => {
    expect(presetFor(33, 50)).toBe('middle-left');
    expect(presetFor(67, 50)).toBe('middle-right');
    // El centro-centro imposible cae al lado más cercano.
    expect(presetFor(49, 49)).toBe('middle-left');
    expect(presetFor(51, 51)).toBe('middle-right');
  });

  it('positionForPreset ↔ presetFor son consistentes para los 8 presets', () => {
    for (const preset of PERF_PRESETS) {
      const { posX, posY } = positionForPreset(preset);
      expect(presetFor(posX, posY)).toBe(preset);
    }
  });
});

describe('normalizePerfOverlay', () => {
  it('input basura → defaults (con copia propia de metrics)', () => {
    const a = normalizePerfOverlay(null);
    expect(a).toEqual(DEFAULT_PERF_OVERLAY);
    a.metrics.fps = false;
    expect(DEFAULT_PERF_OVERLAY.metrics.fps).toBe(true);
  });

  it('acepta parciales y valida campo a campo', () => {
    const config = normalizePerfOverlay({
      metrics: { fps: false, ram: true, basura: true },
      posX: 200,
      posY: -3,
      layout: 'diagonal',
      textColor: 'verde',
      bgOpacity: 400,
    });
    expect(config.metrics.fps).toBe(false);
    expect(config.metrics.ram).toBe(true);
    expect(config.posX).toBe(100);
    expect(config.posY).toBe(0);
    expect(config.layout).toBe(DEFAULT_PERF_OVERLAY.layout);
    expect(config.textColor).toBe(DEFAULT_PERF_OVERLAY.textColor);
    expect(config.bgOpacity).toBe(100);
  });

  it('normaliza el color hex a mayúsculas y respeta posiciones válidas', () => {
    const config = normalizePerfOverlay({ textColor: ' #a1b2c3 ', posX: 67, posY: 40 });
    expect(config.textColor).toBe('#A1B2C3');
    expect(config.posX).toBe(67);
    expect(config.posY).toBe(40);
  });

  it('settings guardados sin perfOverlay migran a defaults', () => {
    const settings = normalizeCaptureSettings({ fps: 60, overlayEnabled: true });
    expect(settings.perfOverlay).toEqual(DEFAULT_PERF_OVERLAY);
    expect(settings.perfOverlayEnabled).toBe(false);
    expect(settings.perfOverlayHotkey).toBe('Alt+R');
    expect(settings.autoLaunchElevated).toBe(false);
  });

  it('el default de CaptureSettings incluye el overlay apagado con Alt+R', () => {
    expect(DEFAULT_CAPTURE_SETTINGS.perfOverlayEnabled).toBe(false);
    expect(DEFAULT_CAPTURE_SETTINGS.perfOverlayHotkey).toBe('Alt+R');
  });
});

describe('perfLines', () => {
  it('solo pinta las métricas marcadas, en el orden del catálogo', () => {
    const lines = perfLines(
      { ...DEFAULT_PERF_OVERLAY.metrics, fps: true, gpuUsage: false, cpuUsage: true, ram: true },
      { ...EMPTY_PERF_SNAPSHOT, fps: 143.6, cpuUsage: 12.2, ramUsedMb: 8500 },
    );
    expect(lines.map((l) => l.key)).toEqual(['fps', 'cpuUsage', 'ram']);
    expect(lines[0].value).toBe('144');
    expect(lines[1].value).toBe('12 %');
    expect(lines[2].value).toBe('8,3 GB');
  });

  it('formatea VRAM usada / total y voltaje con coma decimal', () => {
    const metrics = { ...DEFAULT_PERF_OVERLAY.metrics, vram: true, gpuVoltage: true };
    const lines = perfLines(metrics, {
      ...EMPTY_PERF_SNAPSHOT,
      vramUsedMb: 4717,
      vramTotalMb: 12282,
      gpuVoltage: 0.8961,
    });
    const vram = lines.find((l) => l.key === 'vram')!;
    const volt = lines.find((l) => l.key === 'gpuVoltage')!;
    expect(vram.value).toBe('4,6 / 12,0 GB');
    expect(volt.value).toBe('0,896 V');
  });

  it('valor no disponible → «—» sin romper el resto', () => {
    const metrics = { ...DEFAULT_PERF_OVERLAY.metrics, gpuTemp: true, cpuTemp: true };
    const lines = perfLines(metrics, { ...EMPTY_PERF_SNAPSHOT, gpuTemp: 63 });
    expect(lines.find((l) => l.key === 'gpuTemp')!.value).toBe('63 °C');
    expect(lines.find((l) => l.key === 'cpuTemp')!.value).toBe('—');
    expect(lines.find((l) => l.key === 'fps')!.value).toBe('—');
  });
});

describe('perfWindowPosition', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
  const win = { width: 1100, height: 340 };

  it('0/0 pega al margen superior izquierdo y 100/100 al inferior derecho', () => {
    expect(perfWindowPosition(0, 0, workArea, win, 16)).toEqual({ x: 16, y: 16 });
    expect(perfWindowPosition(100, 100, workArea, win, 16)).toEqual({
      x: 1920 - 1100 - 16,
      y: 1040 - 340 - 16,
    });
  });

  it('interpola linealmente y respeta el origen del work area', () => {
    const desplazado = { x: 100, y: 200, width: 1920, height: 1040 };
    const centro = perfWindowPosition(50, 0, desplazado, win, 16);
    expect(centro.x).toBe(100 + 16 + Math.round((1920 - 1100 - 32) / 2));
    expect(centro.y).toBe(200 + 16);
  });

  it('ventana más grande que el área no se va a negativo', () => {
    const chico = { x: 0, y: 0, width: 800, height: 300 };
    expect(perfWindowPosition(100, 100, chico, win, 16)).toEqual({ x: 16, y: 16 });
  });
});
