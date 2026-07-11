import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import CaptureBar from '../components/CaptureBar';
import { crearGameclipMock } from './setup';

type GameclipMock = ReturnType<typeof crearGameclipMock>;

function mock(): GameclipMock {
  return window.gameclip as unknown as GameclipMock;
}

beforeEach(() => {
  Object.defineProperty(window, 'gameclip', { writable: true, value: crearGameclipMock() });
});

describe('CaptureBar', () => {
  it('muestra el estado del buffer y las acciones disponibles', async () => {
    render(<CaptureBar />);

    expect(await screen.findByText('Buffer activo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar clip' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grabar' })).toBeInTheDocument();
  });

  it('con captura no disponible muestra el error y oculta las acciones', async () => {
    mock().capture.getStatus.mockResolvedValue({
      state: 'unavailable',
      error: 'libobs no pudo inicializar (código -5).',
      lastClipPath: null,
    });
    render(<CaptureBar />);

    expect(await screen.findByText('Captura no disponible')).toBeInTheDocument();
    expect(screen.getByText(/libobs no pudo inicializar/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Grabar' })).not.toBeInTheDocument();
  });

  it('guardar clip llama a saveReplay y muestra el último clip', async () => {
    const user = userEvent.setup();
    render(<CaptureBar />);

    await user.click(await screen.findByRole('button', { name: 'Guardar clip' }));

    expect(mock().capture.saveReplay).toHaveBeenCalledOnce();
    expect(await screen.findByText(/replay\.mp4/)).toBeInTheDocument();
  });

  it('grabar pasa a estado grabando y detener vuelve al buffer', async () => {
    const user = userEvent.setup();
    render(<CaptureBar />);

    await user.click(await screen.findByRole('button', { name: 'Grabar' }));
    expect(await screen.findByText('Grabando')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Detener' }));
    expect(await screen.findByText('Buffer activo')).toBeInTheDocument();
    expect(mock().capture.stopRecording).toHaveBeenCalledOnce();
  });

  it('se suscribe a los cambios de estado push', async () => {
    render(<CaptureBar />);
    await screen.findByText('Buffer activo');
    expect(mock().capture.onStatusChanged).toHaveBeenCalledOnce();
  });

  it('muestra el chip del juego detectado', async () => {
    mock().capture.getStatus.mockResolvedValue({
      state: 'buffering',
      error: null,
      lastClipPath: null,
      detectedGame: 'Valorant',
    });
    render(<CaptureBar />);

    expect(await screen.findByText(/Valorant/)).toBeInTheDocument();
  });
});
