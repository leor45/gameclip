import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PerfOverlayData } from '@shared/ipc';
import { DEFAULT_PERF_OVERLAY, EMPTY_PERF_SNAPSHOT } from '@shared/perf';
import PerfOverlay from '../perf-overlay/PerfOverlay';
import { crearGameclipMock } from './setup';

let emitir: (data: PerfOverlayData) => void = () => undefined;

beforeEach(() => {
  const mock = crearGameclipMock();
  mock.perf.onData = vi.fn().mockImplementation((listener: (d: PerfOverlayData) => void) => {
    emitir = listener;
    return () => undefined;
  });
  Object.defineProperty(window, 'gameclip', { writable: true, value: mock });
});

function data(parcial: Partial<PerfOverlayData['config']> = {}): PerfOverlayData {
  return {
    config: { ...DEFAULT_PERF_OVERLAY, ...parcial },
    snapshot: { ...EMPTY_PERF_SNAPSHOT, fps: 144, gpuUsage: 57, cpuUsage: 12 },
  };
}

describe('PerfOverlay (página)', () => {
  it('no pinta nada hasta que llegan datos', () => {
    render(<PerfOverlay />);
    expect(screen.queryByTestId('perf-root')).not.toBeInTheDocument();
  });

  it('pinta solo las métricas marcadas, con «—» para las no disponibles', () => {
    render(<PerfOverlay />);
    act(() =>
      emitir(
        data({ metrics: { ...DEFAULT_PERF_OVERLAY.metrics, gpuTemp: true, ram: false } }),
      ),
    );
    expect(screen.getByText('FPS')).toBeInTheDocument();
    expect(screen.getByText('144')).toBeInTheDocument();
    expect(screen.getByText('57 %')).toBeInTheDocument();
    // gpuTemp marcada pero sin sensor → «—»; RAM desmarcada → ni aparece.
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('RAM')).not.toBeInTheDocument();
  });

  it('aplica color, opacidad de fondo, disposición y anclaje del preset', () => {
    render(<PerfOverlay />);
    act(() =>
      emitir(data({ textColor: '#00FF00', bgOpacity: 50, layout: 'horizontal', posX: 100, posY: 50 })),
    );
    const root = screen.getByTestId('perf-root');
    expect(root.dataset.fila).toBe('middle');
    expect(root.dataset.columna).toBe('right');
    const card = root.querySelector('.perf-card') as HTMLElement;
    expect(card.className).toContain('perf-horizontal');
    expect(card.style.color).toBe('rgb(0, 255, 0)');
    expect(card.style.backgroundColor).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('aplica la clase del tamaño de fuente elegido', () => {
    render(<PerfOverlay />);
    act(() => emitir(data({ fontSize: 'large' })));
    expect(screen.getByTestId('perf-root').querySelector('.perf-card')!.className).toContain(
      'perf-font-large',
    );
  });

  it('sin ninguna métrica marcada no renderiza la tarjeta', () => {
    render(<PerfOverlay />);
    const apagadas = Object.fromEntries(
      Object.keys(DEFAULT_PERF_OVERLAY.metrics).map((k) => [k, false]),
    ) as typeof DEFAULT_PERF_OVERLAY.metrics;
    act(() => emitir(data({ metrics: apagadas })));
    expect(screen.queryByTestId('perf-root')).not.toBeInTheDocument();
  });
});
