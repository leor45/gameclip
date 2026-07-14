import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OverlayState } from '@shared/ipc';
import type { OverlayNotice } from '@shared/overlay';
import Overlay from '../overlay/Overlay';
import { crearGameclipMock } from './setup';

let emitir: (state: OverlayState) => void = () => undefined;

/** Estado del overlay; lo que no se diga, apagado. */
function estado(parcial: Partial<OverlayState>): OverlayState {
  return { recording: false, toast: null, notice: null, ...parcial };
}

const AVISO: OverlayNotice = {
  title: 'Listo para clipear',
  hotkeys: [
    { key: 'F8', label: 'Guardar el último minuto' },
    { key: 'F6', label: 'Guardar una captura' },
  ],
  controllerCapture: false,
};

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

    act(() => emitir(estado({ recording: true })));
    expect(screen.getByRole('status')).toHaveTextContent('REC');

    act(() => emitir(estado({ recording: false })));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('el toast de clip guardado usa la misma tarjeta que el aviso', () => {
    render(<Overlay />);

    act(() => emitir(estado({ toast: 'Clip guardado ✓' })));

    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Clip guardado ✓');
    expect(toast.className).toContain('overlay-card');
  });

  it('al quitar el toast, se anima la salida y recién ahí se desmonta', () => {
    render(<Overlay />);
    act(() => emitir(estado({ toast: 'Clip guardado ✓' })));

    act(() => emitir(estado({ toast: null })));
    const toast = screen.getByRole('status');
    expect(toast.className).toContain('is-leaving');

    fireEvent.animationEnd(toast);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('Overlay — aviso al detectarse el juego', () => {
  it('pinta el título y una fila por hotkey, con la tecla configurada', () => {
    render(<Overlay />);

    act(() => emitir(estado({ notice: AVISO })));

    const aviso = screen.getByTestId('overlay-notice');
    expect(aviso).toHaveTextContent('Listo para clipear');
    expect(aviso).toHaveTextContent('F8');
    expect(aviso).toHaveTextContent('Guardar el último minuto');
    expect(aviso).toHaveTextContent('F6');
    expect(aviso.className).not.toContain('is-leaving');
  });

  it('al quitarlo el main, se anima la salida y recién ahí se desmonta', () => {
    render(<Overlay />);
    act(() => emitir(estado({ notice: AVISO })));

    // El main dice "quitalo": el aviso sigue en el DOM, ahora saliendo.
    act(() => emitir(estado({ notice: null })));
    const aviso = screen.getByTestId('overlay-notice');
    expect(aviso.className).toContain('is-leaving');

    // jsdom no corre animaciones: se dispara el final a mano.
    fireEvent.animationEnd(aviso);
    expect(screen.queryByTestId('overlay-notice')).not.toBeInTheDocument();
  });

  it('un aviso nuevo mientras el anterior sale cancela la salida', () => {
    render(<Overlay />);
    act(() => emitir(estado({ notice: AVISO })));
    act(() => emitir(estado({ notice: null })));

    act(() =>
      emitir(estado({ notice: { title: 'Listo para clipear', hotkeys: [], controllerCapture: false } })),
    );

    expect(screen.getByTestId('overlay-notice').className).not.toContain('is-leaving');
  });

  it('anuncia la captura con mandos solo cuando está activa', () => {
    render(<Overlay />);

    act(() => emitir(estado({ notice: AVISO })));
    expect(screen.queryByText('Captura con mandos habilitada')).not.toBeInTheDocument();

    act(() => emitir(estado({ notice: { ...AVISO, controllerCapture: true } })));
    expect(screen.getByText('Captura con mandos habilitada')).toBeInTheDocument();
  });
});
