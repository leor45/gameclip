import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CAPTURE_SETTINGS, type CaptureSettings } from '@shared/capture';
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
    conJuego('Valorant');
    render(<CaptureBar />);

    expect(await screen.findByText(/Valorant/)).toBeInTheDocument();
  });
});

/** Estado con un juego detectado (el resto, como el mock por defecto). */
function conJuego(detectedGame: string | null) {
  mock().capture.getStatus.mockResolvedValue({
    state: 'buffering',
    error: null,
    lastClipPath: null,
    detectedGame,
  });
}

function conAjustes(overrides: Partial<CaptureSettings>) {
  mock().capture.getSettings.mockResolvedValue({ ...DEFAULT_CAPTURE_SETTINGS, ...overrides });
}

describe('CaptureBar — indicador de juego', () => {
  it('sin juego, invita a esperar uno', async () => {
    conJuego(null);
    render(<CaptureBar />);

    expect(await screen.findByText('Esperando juego')).toBeInTheDocument();
  });

  it('un juego de la lista curada no se marca como manual', async () => {
    conJuego('Valorant');
    conAjustes({ customGames: [{ executable: 'MiJuego.exe' }] });
    render(<CaptureBar />);

    await screen.findByText('Valorant');
    expect(screen.queryByText('manual')).not.toBeInTheDocument();
  });

  it('un juego añadido a mano se marca como manual', async () => {
    // Sin nombre propio, un juego manual se llama como su ejecutable sin .exe.
    conJuego('MiJuego');
    conAjustes({ customGames: [{ executable: 'MiJuego.exe' }] });
    render(<CaptureBar />);

    expect(await screen.findByText('manual')).toBeInTheDocument();
  });

  it('un juego manual con nombre propio se sigue marcando como manual', async () => {
    conJuego('Spiderman');
    conAjustes({ customGames: [{ executable: 'MilesMorales.exe', name: 'Spiderman' }] });
    render(<CaptureBar />);

    expect(await screen.findByText('manual')).toBeInTheDocument();
  });
});

describe('CaptureBar — duración del clip', () => {
  it('muestra la duración configurada y la guarda al cambiarla', async () => {
    const user = userEvent.setup();
    conAjustes({ replaySeconds: 60 });
    render(<CaptureBar />);

    const select = (await screen.findByLabelText('Duración del clip')) as HTMLSelectElement;
    expect(select.value).toBe('60');

    await user.selectOptions(select, '120');

    expect(mock().capture.setSettings).toHaveBeenCalledWith({ replaySeconds: 120 });
    expect(select.value).toBe('120');
  });

  it('un valor que no es preset (puesto en Ajustes) se muestra igual', async () => {
    conAjustes({ replaySeconds: 45 });
    render(<CaptureBar />);

    const select = (await screen.findByLabelText('Duración del clip')) as HTMLSelectElement;
    expect(select.value).toBe('45');
    expect(screen.getByRole('option', { name: '45 s' })).toBeInTheDocument();
  });

  it('cambiar la duración desde Ajustes actualiza el control en el acto', async () => {
    conAjustes({ replaySeconds: 60 });
    let empujar: ((s: CaptureSettings) => void) | null = null;
    mock().capture.onSettingsChanged.mockImplementation((listener: (s: CaptureSettings) => void) => {
      empujar = listener;
      return () => undefined;
    });
    render(<CaptureBar />);
    const select = (await screen.findByLabelText('Duración del clip')) as HTMLSelectElement;

    act(() => empujar?.({ ...DEFAULT_CAPTURE_SETTINGS, replaySeconds: 300 }));

    expect(select.value).toBe('300');
  });
});
