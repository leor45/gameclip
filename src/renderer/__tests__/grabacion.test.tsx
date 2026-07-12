import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CAPTURE_SETTINGS } from '@shared/capture';
import App from '../App';
import { sesionFalsa } from './helpers';
import { crearGameclipMock } from './setup';

type GameclipMock = ReturnType<typeof crearGameclipMock>;

function mock(): GameclipMock {
  return window.gameclip as unknown as GameclipMock;
}

beforeEach(() => {
  localStorage.setItem('gameclip.session', JSON.stringify(sesionFalsa));
  Object.defineProperty(window, 'gameclip', { writable: true, value: crearGameclipMock() });
});

/** Renderiza la app con sesión activa; /ajustes redirige a Grabación (primera sección). */
async function irAGrabacion() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('link', { name: 'Ajustes' }));
  await screen.findByRole('button', { name: 'Grabar escritorio…' });
  return user;
}

describe('Ajustes — Grabación', () => {
  it('redirige /ajustes a Grabación', async () => {
    await irAGrabacion();
    expect(screen.getByRole('link', { name: 'Grabación' })).toHaveClass('active');
  });

  it('cambia el modo de grabación con los radios y lo guarda', async () => {
    const user = await irAGrabacion();

    await user.click(
      screen.getByLabelText(/Grabar automáticamente la sesión de juego completa/),
    );
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(await screen.findByText('Ajustes guardados ✓')).toBeInTheDocument();
    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ recordingMode: 'auto' }),
    );
  });

  it('guarda los toggles de cambio de juego y capturas de pantalla', async () => {
    const user = await irAGrabacion();

    await user.click(screen.getByLabelText('Activar hotkey de cambio de juego'));
    await user.click(screen.getByLabelText('Al enfocar otro juego ~20 s, cambiar solo'));
    await user.click(screen.getByLabelText('Activar capturas de pantalla'));
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(await screen.findByText('Ajustes guardados ✓')).toBeInTheDocument();
    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        gameSwitchEnabled: false,
        autoGameSwitching: false,
        screenshotsEnabled: false,
      }),
    );
  });

  it('añade un juego manual desde el combo de procesos y lo quita con el basurero', async () => {
    const user = await irAGrabacion();

    await user.selectOptions(screen.getByLabelText('Proceso en ejecución'), 'Spotify.exe');
    await user.click(screen.getByRole('button', { name: 'Añadir juego' }));

    expect(await screen.findByText('Spotify.exe')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Quitar Spotify.exe' }));
    expect(screen.queryByText('Spotify.exe')).not.toBeInTheDocument();
  });

  it('añade un juego con el texto libre alternativo', async () => {
    const user = await irAGrabacion();

    await user.type(screen.getByLabelText('Escribe el ejecutable'), 'MiJuego.exe');
    await user.click(screen.getByRole('button', { name: 'Añadir juego' }));

    expect(await screen.findByText('MiJuego.exe')).toBeInTheDocument();
  });

  it('pre-rellena el nombre con el que deduce la app, y lo guarda con el juego', async () => {
    mock().games.suggestName.mockResolvedValue("Marvel's Spider-Man: Miles Morales");
    const user = await irAGrabacion();

    await user.type(screen.getByLabelText('Escribe el ejecutable'), 'MilesMorales.exe');
    await waitFor(() =>
      expect(screen.getByLabelText('Nombre (opcional)')).toHaveValue(
        "Marvel's Spider-Man: Miles Morales",
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Añadir juego' }));
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        customGames: [
          { executable: 'MilesMorales.exe', name: "Marvel's Spider-Man: Miles Morales" },
        ],
      }),
    );
  });

  it('el listado muestra «Nombre (ejecutable.exe)» cuando el juego tiene nombre', async () => {
    mock().capture.getSettings.mockResolvedValue({
      ...DEFAULT_CAPTURE_SETTINGS,
      customGames: [{ executable: 'MilesMorales.exe', name: 'Spiderman' }, { executable: 'Otro.exe' }],
    });
    await irAGrabacion();

    expect(await screen.findByText('Spiderman (MilesMorales.exe)')).toBeInTheDocument();
    // Sin nombre, se sigue viendo solo el ejecutable, como hasta ahora.
    expect(screen.getByText('Otro.exe')).toBeInTheDocument();
  });

  it('un juego sin nombre propio toma el del índice de launchers', async () => {
    mock().games.getIndex.mockResolvedValue({ pioneergame: 'ARC Raiders' });
    mock().capture.getSettings.mockResolvedValue({
      ...DEFAULT_CAPTURE_SETTINGS,
      customGames: [{ executable: 'PioneerGame.exe' }],
    });
    await irAGrabacion();

    expect(await screen.findByText('ARC Raiders (PioneerGame.exe)')).toBeInTheDocument();
  });

  it('renombrar un juego ya añadido guarda el nombre nuevo', async () => {
    mock().capture.getSettings.mockResolvedValue({
      ...DEFAULT_CAPTURE_SETTINGS,
      customGames: [{ executable: 'MilesMorales.exe' }],
    });
    const user = await irAGrabacion();

    const campo = await screen.findByLabelText('Nombre de MilesMorales.exe');
    await user.type(campo, 'Spiderman');
    await user.tab(); // el nombre se guarda al salir del campo
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        customGames: [{ executable: 'MilesMorales.exe', name: 'Spiderman' }],
      }),
    );
  });

  it('«Volver a escanear» relee los launchers', async () => {
    mock().games.rescan.mockResolvedValue({ pioneergame: 'ARC Raiders' });
    const user = await irAGrabacion();

    await user.click(
      screen.getByRole('button', { name: 'Volver a escanear los juegos instalados' }),
    );

    expect(mock().games.rescan).toHaveBeenCalledOnce();
    expect(await screen.findByText(/1 ejecutables reconocidos/)).toBeInTheDocument();
  });

  it('abre el modal de displays, muestra los mockeados y "Empezar a grabar" fija el monitor', async () => {
    const user = await irAGrabacion();

    await user.click(screen.getByRole('button', { name: 'Grabar escritorio…' }));

    expect(await screen.findByAltText('Monitor 1')).toBeInTheDocument();
    expect(screen.getByAltText('Monitor 2')).toBeInTheDocument();
    expect(screen.getByText('(principal)')).toBeInTheDocument();

    await user.click(screen.getByAltText('Monitor 2'));
    await user.click(screen.getByRole('button', { name: 'Empezar a grabar' }));

    await waitFor(() => {
      expect(mock().capture.setSettings).toHaveBeenCalledWith(
        expect.objectContaining({ screenMonitorIndex: 1 }),
      );
    });
    expect(mock().capture.startRecording).toHaveBeenCalled();
  });

  it('el selector de monitor de la sección guarda screenMonitorIndex sin pasar por el modal', async () => {
    const user = await irAGrabacion();

    await screen.findByText('Monitor 2');
    await user.selectOptions(screen.getByLabelText('Monitor'), '1');
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(await screen.findByText('Ajustes guardados ✓')).toBeInTheDocument();
    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ screenMonitorIndex: 1 }),
    );
  });

  it('guarda el toggle de cambio automático a captura de juego', async () => {
    const user = await irAGrabacion();

    await user.click(
      screen.getByLabelText('Cambiar automáticamente a captura de juego al lanzarse un juego'),
    );
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(await screen.findByText('Ajustes guardados ✓')).toBeInTheDocument();
    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ desktopAutoSwitchToGame: false }),
    );
  });

  it('desactivar la grabación de escritorio la guarda y deshabilita sus opciones', async () => {
    const user = await irAGrabacion();

    await user.click(screen.getByLabelText('Grabar el escritorio cuando no hay ningún juego'));

    // El interruptor maestro apagado: sus controles hijos no tienen efecto y se deshabilitan.
    expect(screen.getByLabelText('Monitor')).toBeDisabled();
    expect(
      screen.getByLabelText('Cambiar automáticamente a captura de juego al lanzarse un juego'),
    ).toBeDisabled();
    expect(screen.getByLabelText('Audio del clip de escritorio')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Grabar escritorio…' })).toBeDisabled();
    expect(
      screen.getByText('Solo se capturan juegos: sin un juego detectado no se graba nada.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    expect(await screen.findByText('Ajustes guardados ✓')).toBeInTheDocument();
    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ desktopRecordingEnabled: false }),
    );
  });

  it('guarda las pistas de audio del clip de escritorio', async () => {
    const user = await irAGrabacion();

    await user.selectOptions(screen.getByLabelText('Audio del clip de escritorio'), 'separate');
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(await screen.findByText('Ajustes guardados ✓')).toBeInTheDocument();
    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ desktopAudioTracks: 'separate' }),
    );
  });
});
