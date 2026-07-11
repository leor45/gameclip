import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
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
});
