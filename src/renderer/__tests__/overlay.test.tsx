import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OverlayState } from '@shared/ipc';
import Overlay from '../overlay/Overlay';
import { crearGameclipMock } from './setup';

let emitir: (state: OverlayState) => void = () => undefined;

beforeEach(() => {
  const mock = crearGameclipMock();
  // Captura el listener para poder empujar estados como haría el main.
  mock.overlay.onState = vi.fn().mockImplementation((listener: (s: OverlayState) => void) => {
    emitir = listener;
    return () => undefined;
  });
  Object.defineProperty(window, 'gameclip', { writable: true, value: mock });
});

describe('Overlay in-game', () => {
  it('en reposo no muestra nada', () => {
    render(<Overlay />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('muestra el indicador REC mientras se graba y lo quita al parar', () => {
    render(<Overlay />);

    act(() => emitir({ recording: true, toast: null }));
    expect(screen.getByRole('status')).toHaveTextContent('REC');

    act(() => emitir({ recording: false, toast: null }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('muestra el toast de clip guardado, también junto al indicador REC', () => {
    render(<Overlay />);

    act(() => emitir({ recording: false, toast: 'Clip guardado ✓' }));
    expect(screen.getByRole('status')).toHaveTextContent('Clip guardado ✓');

    act(() => emitir({ recording: true, toast: 'Clip guardado ✓' }));
    const pills = screen.getAllByRole('status');
    expect(pills).toHaveLength(2);
    expect(pills[0]).toHaveTextContent('REC');
    expect(pills[1]).toHaveTextContent('Clip guardado ✓');
  });
});
