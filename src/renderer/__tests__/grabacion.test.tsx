import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CAPTURE_SETTINGS } from '@shared/capture';
import App from '../App';
import { sesionFalsa, elegirOpcion, abrirOpciones } from './helpers';
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

    await user.click(screen.getByLabelText(/Grabar automáticamente la sesión de juego completa/));
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

    await elegirOpcion(user, screen.getByLabelText('Proceso en ejecución'), 'Spotify.exe');
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

  it('el listado muestra el nombre con su ejecutable debajo cuando el juego tiene nombre', async () => {
    mock().capture.getSettings.mockResolvedValue({
      ...DEFAULT_CAPTURE_SETTINGS,
      customGames: [
        { executable: 'MilesMorales.exe', name: 'Spiderman' },
        { executable: 'Otro.exe' },
      ],
    });
    await irAGrabacion();

    const nombre = await screen.findByText('Spiderman');
    // El ejecutable va en la misma fila, debajo del nombre.
    expect(nombre.closest('li')).toHaveTextContent('MilesMorales.exe');
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

    const nombre = await screen.findByText('ARC Raiders');
    expect(nombre.closest('li')).toHaveTextContent('PioneerGame.exe');
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

  it('regresión: Enter en el nombre confirma el renombre sin guardar el formulario con el viejo', async () => {
    // El input no controlado aplicaba el nombre en onBlur; Enter enviaba el formulario antes del blur
    // y se guardaba sin el nombre («Ajustes guardados ✓» incluido), y el cambio se perdía al salir.
    mock().capture.getSettings.mockResolvedValue({
      ...DEFAULT_CAPTURE_SETTINGS,
      customGames: [{ executable: 'MilesMorales.exe' }],
    });
    const user = await irAGrabacion();

    const campo = await screen.findByLabelText('Nombre de MilesMorales.exe');
    await user.type(campo, 'Spiderman{Enter}');

    expect(mock().capture.setSettings).not.toHaveBeenCalled();
    expect(screen.queryByText('Ajustes guardados ✓')).not.toBeInTheDocument();

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
    // Sin opciones: el main lo trata como forzado (re-escanea aunque la caché coincida).
    expect(mock().games.rescan).toHaveBeenCalledWith();
    expect(await screen.findByText(/1 juegos reconocidos/)).toBeInTheDocument();
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

    // El selector de capturas lista los mismos monitores, así que el texto se busca DENTRO de este.
    const selector = screen.getByLabelText('Monitor');
    await elegirOpcion(user, selector, '1');
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(await screen.findByText('Ajustes guardados ✓')).toBeInTheDocument();
    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ screenMonitorIndex: 1 }),
    );
  });

  it('el selector de monitor de las capturas guarda screenshotMonitorIndex', async () => {
    const user = await irAGrabacion();

    const selector = screen.getByLabelText('Monitor de las capturas');
    await elegirOpcion(user, selector, '1');
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(await screen.findByText('Ajustes guardados ✓')).toBeInTheDocument();
    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ screenshotMonitorIndex: 1 }),
    );
    // El monitor de grabación no se toca: son ajustes independientes (ni siquiera se envía).
    expect(mock().capture.setSettings.mock.calls[0][0]).not.toHaveProperty('screenMonitorIndex');
  });

  it('el selector de capturas NO depende de la grabación de escritorio', async () => {
    // El caso del owner: capturas activas con la grabación apagada. El selector de grabación se
    // deshabilita, el de capturas no.
    mock().capture.getSettings.mockResolvedValue({
      ...DEFAULT_CAPTURE_SETTINGS,
      desktopRecordingEnabled: false,
      recordingMode: 'off',
      screenshotsEnabled: true,
    });
    await irAGrabacion();

    await waitFor(() => expect(screen.getByLabelText('Monitor')).toBeDisabled());
    expect(screen.getByLabelText('Monitor de las capturas')).toBeEnabled();
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

    await elegirOpcion(user, screen.getByLabelText('Audio del clip de escritorio'), 'separate');
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(await screen.findByText('Ajustes guardados ✓')).toBeInTheDocument();
    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ desktopAudioTracks: 'separate' }),
    );
  });
});

describe('Ajustes — Grabación · No son juegos', () => {
  it('muestra la lista con su origen y añade a mano al momento (sin «Guardar ajustes»)', async () => {
    mock().capture.getSettings.mockResolvedValue({
      ...DEFAULT_CAPTURE_SETTINGS,
      excludedGames: [{ name: 'Wallpaper Engine', source: 'auto', enabled: true }],
    });
    mock().games.listInstalled.mockResolvedValue([
      { name: 'Wallpaper Engine', source: 'steam' },
      { name: 'Lossless Scaling', source: 'steam' },
    ]);
    const user = await irAGrabacion();

    expect(await screen.findByLabelText('Excluir Wallpaper Engine')).toBeChecked();
    expect(screen.getByText('auto', { selector: '.settings-origen' })).toBeInTheDocument();

    // El desplegable solo ofrece lo que no está ya en la lista.
    const select = screen.getByLabelText('Instalado');
    const opciones = await abrirOpciones(user, select);
    expect(opciones.find((o) => o.dataset.value === 'Wallpaper Engine')).toBeUndefined();
    await user.keyboard('{Escape}');
    await elegirOpcion(user, select, 'Lossless Scaling');
    await user.click(screen.getByRole('button', { name: 'Añadir' }));

    expect(mock().games.setExcluded).toHaveBeenCalledWith([
      { name: 'Wallpaper Engine', source: 'auto', enabled: true },
      { name: 'Lossless Scaling', source: 'manual', enabled: true },
    ]);
    expect(await screen.findByLabelText('Excluir Lossless Scaling')).toBeChecked();
    expect(mock().capture.setSettings).not.toHaveBeenCalled();
  });

  it('desmarcar una automática la desactiva en vez de borrarla', async () => {
    mock().capture.getSettings.mockResolvedValue({
      ...DEFAULT_CAPTURE_SETTINGS,
      excludedGames: [{ name: 'SteamVR', source: 'auto', enabled: true }],
    });
    const user = await irAGrabacion();
    await user.click(await screen.findByLabelText('Excluir SteamVR'));
    expect(mock().games.setExcluded).toHaveBeenCalledWith([
      { name: 'SteamVR', source: 'auto', enabled: false },
    ]);
    expect(screen.queryByRole('button', { name: 'Quitar SteamVR' })).toBeNull();
  });

  it('si el IPC rechaza, recarga la lista de los ajustes en vez de dejar la optimista (regresión Bug 5)', async () => {
    mock().capture.getSettings.mockResolvedValue({
      ...DEFAULT_CAPTURE_SETTINGS,
      excludedGames: [{ name: 'SteamVR', source: 'auto', enabled: true }],
    });
    mock().games.setExcluded.mockRejectedValue(new Error('no se pudo guardar'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const user = await irAGrabacion();
      await user.click(await screen.findByLabelText('Excluir SteamVR'));

      // La lista vuelve a lo que de verdad hay guardado (el alternar no se guardó), sin rechazo suelto.
      await waitFor(() => expect(screen.getByLabelText('Excluir SteamVR')).toBeChecked());
      expect(mock().games.setExcluded).toHaveBeenCalledOnce();
    } finally {
      error.mockRestore();
    }
  });

  it('«Sincronizar» re-lee los launchers y muestra la lista resultante', async () => {
    const user = await irAGrabacion();
    mock().capture.getSettings.mockResolvedValue({
      ...DEFAULT_CAPTURE_SETTINGS,
      excludedGames: [{ name: 'Wallpaper Engine', source: 'auto', enabled: true }],
    });
    await user.click(screen.getByRole('button', { name: 'Sincronizar' }));
    expect(mock().games.rescan).toHaveBeenCalled();
    expect(await screen.findByLabelText('Excluir Wallpaper Engine')).toBeChecked();
  });

  it('«Sincronizar» pide un refresco normal, no el re-escaneo forzado (regresión D1-BUG-1)', async () => {
    // Para sincronizar la lista basta releer los launchers; forzar re-escaneaba el disco en cada clic.
    const user = await irAGrabacion();
    await user.click(screen.getByRole('button', { name: 'Sincronizar' }));
    expect(mock().games.rescan).toHaveBeenCalledOnce();
    expect(mock().games.rescan).toHaveBeenCalledWith({ force: false });
  });

  it('guardar la sección no toca la lista (solo cambia por su IPC)', async () => {
    const user = await irAGrabacion();
    await user.click(screen.getByLabelText(/Grabar automáticamente la sesión de juego completa/));
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    await screen.findByText('Ajustes guardados ✓');
    expect(mock().games.setExcluded).not.toHaveBeenCalled();
  });
});
