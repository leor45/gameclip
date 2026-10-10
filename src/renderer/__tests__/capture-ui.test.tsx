import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_CAPTURE_SETTINGS,
  type CaptureSettings,
  type CaptureStatus,
} from '@shared/capture';
import CaptureBar from '../components/CaptureBar';
import { crearGameclipMock } from './setup';

type GameclipMock = ReturnType<typeof crearGameclipMock>;

function mock(): GameclipMock {
  return window.gameclip as unknown as GameclipMock;
}

beforeEach(() => {
  Object.defineProperty(window, 'gameclip', { writable: true, value: crearGameclipMock() });
});

/** Sonda de la ruta: muestra dónde está y el `state` con el que se llegó. */
function Sonda() {
  const { pathname, state } = useLocation();
  return (
    <p data-testid="ruta">
      {pathname} {JSON.stringify(state)}
    </p>
  );
}

function renderBar() {
  return render(
    <MemoryRouter initialEntries={['/biblioteca']}>
      <CaptureBar />
      <Routes>
        <Route path="*" element={<Sonda />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Estado de captura con los campos que no importan en cada test rellenados. */
function conEstado(state: string, extra: Record<string, unknown> = {}) {
  mock().capture.getStatus.mockResolvedValue({
    state,
    error: null,
    lastClipPath: null,
    detectedGame: null,
    ...extra,
  });
}

describe('CaptureBar', () => {
  it('muestra el estado del buffer y las acciones disponibles', async () => {
    renderBar();

    expect(await screen.findByRole('img', { name: 'Buffer activo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar clip' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grabar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Detener' })).not.toBeInTheDocument();
  });

  it('con el buffer activo solo se ve el punto: el texto del estado no se escribe', async () => {
    renderBar();

    const dot = await screen.findByRole('img', { name: 'Buffer activo' });
    expect(dot).toHaveClass('gc-dot', 'on');
    expect(dot).toHaveAttribute('title', 'Buffer activo');
    expect(screen.queryByText('Buffer activo')).not.toBeInTheDocument();
  });

  it.each([
    ['initializing', 'Iniciando captura…'],
    ['idle', 'Captura lista'],
    ['unavailable', 'Captura no disponible'],
    ['recording', 'Grabando'],
  ])('en estado %s escribe «%s»', async (state, texto) => {
    conEstado(state);
    renderBar();

    expect(await screen.findByText(texto)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Buffer activo' })).not.toBeInTheDocument();
  });

  it('con captura no disponible muestra el error y oculta las acciones', async () => {
    conEstado('unavailable', { error: 'libobs no pudo inicializar (código -5).' });
    renderBar();

    expect(await screen.findByText('Captura no disponible')).toBeInTheDocument();
    expect(screen.getByText(/libobs no pudo inicializar/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Grabar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar clip' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Detener' })).not.toBeInTheDocument();
  });

  it('sin captura activa la duración sigue al alcance (como el selector de antes)', async () => {
    conEstado('idle');
    renderBar();

    await screen.findByText('Captura lista');
    expect(screen.getByRole('button', { name: 'Duración del clip' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar clip' })).not.toBeInTheDocument();
  });

  it('grabando: Detener y Guardar clip, sin Grabar; «Grabando» se escribe en rojo', async () => {
    conEstado('recording');
    renderBar();

    expect(await screen.findByRole('button', { name: 'Detener' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar clip' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Grabar' })).not.toBeInTheDocument();
    expect(screen.getByText('Grabando')).toHaveClass('is-rec');
  });

  it('guardar clip llama a saveReplay y muestra el último clip sin etiqueta', async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(await screen.findByRole('button', { name: 'Guardar clip' }));

    expect(mock().capture.saveReplay).toHaveBeenCalledOnce();
    const ultimo = await screen.findByText(/replay\.mp4/);
    expect(ultimo).not.toHaveTextContent('Último clip');
    // La ruta completa queda en el tooltip.
    expect(ultimo.closest('.cap-last')).toHaveAttribute(
      'title',
      expect.stringContaining('replay.mp4'),
    );
  });

  it('grabar pasa a estado grabando y detener vuelve al buffer', async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(await screen.findByRole('button', { name: 'Grabar' }));
    expect(await screen.findByText('Grabando')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Detener' }));
    expect(await screen.findByRole('img', { name: 'Buffer activo' })).toBeInTheDocument();
    expect(mock().capture.stopRecording).toHaveBeenCalledOnce();
  });

  it('se suscribe a los cambios de estado push', async () => {
    renderBar();
    await screen.findByRole('img', { name: 'Buffer activo' });
    expect(mock().capture.onStatusChanged).toHaveBeenCalledOnce();
  });

  it('muestra el nombre del juego detectado', async () => {
    conEstado('buffering', { detectedGame: 'Valorant' });
    renderBar();

    expect(await screen.findByText(/Valorant/)).toBeInTheDocument();
  });
});

function conAjustes(overrides: Partial<CaptureSettings>) {
  mock().capture.getSettings.mockResolvedValue({ ...DEFAULT_CAPTURE_SETTINGS, ...overrides });
}

describe('CaptureBar — indicador de juego', () => {
  it('sin juego, invita a esperar uno', async () => {
    conEstado('buffering', { detectedGame: null });
    renderBar();

    expect(await screen.findByText('Esperando juego')).toBeInTheDocument();
  });

  it('un juego de la lista curada no se marca como manual', async () => {
    conEstado('buffering', { detectedGame: 'Valorant' });
    conAjustes({ customGames: [{ executable: 'MiJuego.exe' }] });
    renderBar();

    await screen.findByText('Valorant');
    expect(screen.queryByText('manual')).not.toBeInTheDocument();
  });

  it('un juego añadido a mano se marca como manual', async () => {
    // Sin nombre propio, un juego manual se llama como su ejecutable sin .exe.
    conEstado('buffering', { detectedGame: 'MiJuego' });
    conAjustes({ customGames: [{ executable: 'MiJuego.exe' }] });
    renderBar();

    expect(await screen.findByText('manual')).toBeInTheDocument();
  });

  it('un juego manual con nombre propio se sigue marcando como manual', async () => {
    conEstado('buffering', { detectedGame: 'Spiderman' });
    conAjustes({ customGames: [{ executable: 'MilesMorales.exe', name: 'Spiderman' }] });
    renderBar();

    expect(await screen.findByText('manual')).toBeInTheDocument();
  });
});

describe('CaptureBar — menú de duración del clip', () => {
  const botonDuracion = () => screen.findByRole('button', { name: 'Duración del clip' });

  it('el botón muestra la duración y el menú lista las opciones con la actual marcada', async () => {
    const user = userEvent.setup();
    conAjustes({ replaySeconds: 60 });
    renderBar();

    const boton = await botonDuracion();
    expect(boton).toHaveTextContent('1 m');
    expect(boton).toHaveAttribute('aria-haspopup', 'listbox');
    expect(boton).toHaveAttribute('aria-expanded', 'false');

    await user.click(boton);

    expect(boton).toHaveAttribute('aria-expanded', 'true');
    const lista = screen.getByRole('listbox', { name: 'Duración del clip' });
    const opciones = within(lista).getAllByRole('option');
    expect(opciones.map((o) => o.textContent?.replace('✓', ''))).toEqual([
      '30 s',
      '1 m',
      '2 m',
      '3 m',
      '5 m',
    ]);
    expect(opciones.map((o) => o.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
      'false',
      'false',
    ]);
    expect(within(opciones[1]).getByText('✓')).toBeInTheDocument();
  });

  it('elegir una opción llama a setSettings, actualiza el botón y cierra el menú', async () => {
    const user = userEvent.setup();
    conAjustes({ replaySeconds: 60 });
    renderBar();

    await user.click(await botonDuracion());
    await user.click(screen.getByRole('option', { name: /2 m/ }));

    expect(mock().capture.setSettings).toHaveBeenCalledWith({ replaySeconds: 120 });
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    await waitFor(async () => expect(await botonDuracion()).toHaveTextContent('2 m'));
  });

  it('un valor que no es preset (puesto en Ajustes) se muestra primero, en segundos', async () => {
    const user = userEvent.setup();
    conAjustes({ replaySeconds: 45 });
    renderBar();

    const boton = await botonDuracion();
    expect(boton).toHaveTextContent('45 s');
    await user.click(boton);

    const opciones = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(opciones).toHaveLength(6);
    expect(opciones[0]).toHaveTextContent('45 s');
    expect(opciones[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('teclado: ↓ e Intro eligen; Esc cierra y devuelve el foco al botón', async () => {
    const user = userEvent.setup();
    conAjustes({ replaySeconds: 60 });
    renderBar();

    const boton = await botonDuracion();
    await user.click(boton);
    expect(screen.getByRole('listbox')).toHaveFocus();

    await user.keyboard('{ArrowDown}{Enter}'); // 1 m → 2 m
    expect(mock().capture.setSettings).toHaveBeenCalledWith({ replaySeconds: 120 });
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());

    await user.click(boton);
    await user.keyboard('{ArrowUp}{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(boton).toHaveFocus();
    expect(mock().capture.setSettings).toHaveBeenCalledTimes(1);
  });

  it('Espacio elige la opción activa', async () => {
    const user = userEvent.setup();
    conAjustes({ replaySeconds: 60 });
    renderBar();

    await user.click(await botonDuracion());
    await user.keyboard('{ArrowDown}{ArrowDown} ');

    expect(mock().capture.setSettings).toHaveBeenCalledWith({ replaySeconds: 180 });
  });

  it('un clic fuera cierra el menú sin cambiar nada', async () => {
    const user = userEvent.setup();
    conAjustes({ replaySeconds: 60 });
    renderBar();

    await user.click(await botonDuracion());
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.click(document.body);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(mock().capture.setSettings).not.toHaveBeenCalled();
  });

  it('el pie «Ajustes → General ›» cierra el menú y navega a General pidiendo el foco', async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(await botonDuracion());
    await user.click(screen.getByRole('button', { name: /Ajustes → General/ }));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('ruta')).toHaveTextContent(
      '/ajustes/general {"focus":"replaySeconds"}',
    );
  });

  it('un clic en el título o el relleno del menú no lo cierra', async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(await botonDuracion());
    await user.click(screen.getByText('Duración del clip', { selector: '.cap-menu-title' }));
    await user.click(document.querySelector('.cap-menu') as HTMLElement);

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('Esc cierra también con el foco en el botón', async () => {
    const user = userEvent.setup();
    renderBar();

    const boton = await botonDuracion();
    await user.click(boton);
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(boton).toHaveFocus();
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(boton).toHaveFocus();
  });

  it('cambiar de estado con el menú abierto no lo cierra ni pierde el foco', async () => {
    const user = userEvent.setup();
    let empujar: ((s: CaptureStatus) => void) | null = null;
    mock().capture.onStatusChanged.mockImplementation((listener: (s: CaptureStatus) => void) => {
      empujar = listener;
      return () => undefined;
    });
    renderBar();

    await user.click(await botonDuracion());
    const lista = screen.getByRole('listbox');

    act(() =>
      empujar?.({
        state: 'idle',
        error: null,
        lastClipPath: null,
        detectedGame: null,
      } as CaptureStatus),
    );

    expect(await screen.findByText('Captura lista')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar clip' })).not.toBeInTheDocument();
    expect(screen.getByRole('listbox')).toBe(lista);
    expect(lista).toHaveFocus();
  });

  it('si cambian las opciones con la última activa, Intro no falla y elige dentro de rango', async () => {
    const user = userEvent.setup();
    conAjustes({ replaySeconds: 45 }); // 6 opciones: 45 s + presets
    let empujar: ((s: CaptureSettings) => void) | null = null;
    mock().capture.onSettingsChanged.mockImplementation(
      (listener: (s: CaptureSettings) => void) => {
        empujar = listener;
        return () => undefined;
      },
    );
    renderBar();

    await user.click(await botonDuracion());
    await user.keyboard('{End}'); // activa = índice 5
    act(() => empujar?.({ ...DEFAULT_CAPTURE_SETTINGS, replaySeconds: 60 })); // ahora 5 opciones

    await user.keyboard('{Enter}');

    expect(mock().capture.setSettings).toHaveBeenCalledWith({ replaySeconds: 300 });
  });

  it('cambiar la duración desde Ajustes actualiza el control en el acto', async () => {
    conAjustes({ replaySeconds: 60 });
    let empujar: ((s: CaptureSettings) => void) | null = null;
    mock().capture.onSettingsChanged.mockImplementation(
      (listener: (s: CaptureSettings) => void) => {
        empujar = listener;
        return () => undefined;
      },
    );
    renderBar();
    const boton = await botonDuracion();

    act(() => empujar?.({ ...DEFAULT_CAPTURE_SETTINGS, replaySeconds: 300 }));

    expect(boton).toHaveTextContent('5 m');
  });
});
