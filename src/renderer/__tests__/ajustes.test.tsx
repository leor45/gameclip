import { render, screen } from '@testing-library/react';
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

/** Renderiza la app con sesión activa y navega a /ajustes (que redirige a Grabación). */
async function irAAjustes() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('link', { name: 'Ajustes' }));
  await screen.findByRole('link', { name: 'General' });
  return user;
}

describe('Ajustes — navegación', () => {
  it('redirige /ajustes a Grabación y navega entre secciones', async () => {
    const user = await irAAjustes();

    expect(screen.getByRole('link', { name: 'Grabación' })).toHaveClass('active');

    await user.click(screen.getByRole('link', { name: 'General' }));
    expect(await screen.findByLabelText('Duración del buffer (segundos)')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Calidad' }));
    expect(await screen.findByRole('button', { name: /Alta/ })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Audio' }));
    expect(await screen.findByLabelText('Supresión de ruido (RNNoise)')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Almacenamiento' }));
    expect(await screen.findByRole('button', { name: 'Cambiar…' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Avanzado' }));
    expect(await screen.findByLabelText('Mostrar cursor del mouse')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Desarrollo' }));
    expect(await screen.findByLabelText('Aceleración por hardware')).toBeInTheDocument();
  });
});

describe('Ajustes — General', () => {
  async function irAGeneral() {
    const user = await irAAjustes();
    await user.click(screen.getByRole('link', { name: 'General' }));
    await screen.findByLabelText('Duración del buffer (segundos)');
    return user;
  }

  it('guarda los cambios de la sección con la API', async () => {
    const user = await irAGeneral();

    const buffer = screen.getByLabelText('Duración del buffer (segundos)');
    await user.clear(buffer);
    await user.type(buffer, '90');
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(await screen.findByText('Ajustes guardados ✓')).toBeInTheDocument();
    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ replaySeconds: 90 }),
    );
  });

  it('el atajo del clip se muestra pero no se edita aquí: se edita en Atajos', async () => {
    await irAGeneral();

    expect(screen.getByText('Atajo para guardar clip')).toBeInTheDocument();
    expect(screen.getByText('F8')).toBeInTheDocument(); // el configurado ahora mismo
    expect(screen.queryByLabelText('Hotkey para guardar clip')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Editar en Atajos' })).toHaveAttribute(
      'href',
      '#/ajustes/atajos',
    );
  });

  it('guarda los toggles de comportamiento (bufferMode, overlay, autoLaunch)', async () => {
    const user = await irAGeneral();

    await user.click(screen.getByLabelText('Iniciar el buffer solo al detectar un juego'));
    await user.click(
      screen.getByLabelText('Mostrar overlay al grabar (indicador y confirmación de clip)'),
    );
    await user.click(screen.getByLabelText('Iniciar GameClip con Windows (en la bandeja)'));
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(await screen.findByText('Ajustes guardados ✓')).toBeInTheDocument();
    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ bufferMode: 'game', overlayEnabled: false, autoLaunch: true }),
    );
  });
});

describe('Ajustes — Calidad', () => {
  async function irACalidad() {
    const user = await irAAjustes();
    await user.click(screen.getByRole('link', { name: 'Calidad' }));
    await screen.findByRole('button', { name: /Alta/ });
    return user;
  }

  it('un preset fija resolution/fps/bitrate y se marca activo', async () => {
    const user = await irACalidad();

    await user.click(screen.getByRole('button', { name: /Alta/ }));

    expect(screen.getByLabelText('Resolución')).toHaveValue('1080p');
    expect(screen.getByLabelText('FPS')).toHaveValue('60');
    expect(screen.getByLabelText('Bitrate')).toHaveValue('15');
    expect(screen.getByRole('button', { name: /Alta/ })).toHaveClass('active');
  });

  it('infiere "Personalizada" cuando los valores no coinciden con ningún preset', async () => {
    const user = await irACalidad();

    await user.selectOptions(screen.getByLabelText('FPS'), '144');

    expect(screen.getByRole('button', { name: /Personalizada/ })).toHaveClass('active');
  });

  it('guarda encoder y calidad seleccionados', async () => {
    const user = await irACalidad();

    await user.selectOptions(screen.getByLabelText('Encoder'), 'obs_x264');
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ encoderId: 'obs_x264' }),
    );
  });
});

describe('Ajustes — Audio', () => {
  async function irAAudio() {
    const user = await irAAjustes();
    await user.click(screen.getByRole('link', { name: 'Audio' }));
    await screen.findByLabelText('Supresión de ruido (RNNoise)');
    return user;
  }

  it('en modo apps muestra siempre las filas fijas: juego, micrófono y Discord', async () => {
    const user = await irAAudio();
    await user.click(screen.getByLabelText('Apps específicas'));

    expect(screen.getByLabelText('Audio del juego')).toBeInTheDocument();
    expect(screen.getByLabelText('Micrófono')).toBeInTheDocument();
    // Discord no está corriendo (ni en audioApps): la fila fija aparece igual, desmarcada
    // y sin botón de quitar.
    const discord = screen.getByLabelText('Discord.exe');
    expect(discord).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Quitar Discord.exe' })).not.toBeInTheDocument();
  });

  it('marcar Discord lo materializa en audioApps al guardar', async () => {
    const user = await irAAudio();
    await user.click(screen.getByLabelText('Apps específicas'));

    await user.click(screen.getByLabelText('Discord.exe'));
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(await screen.findByText('Ajustes guardados ✓')).toBeInTheDocument();
    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        audioApps: [{ executable: 'Discord.exe', volume: 100, enabled: true }],
      }),
    );
  });

  it('permite añadir una app, desactivarla con el checkbox sin quitarla, y quitarla con el basurero', async () => {
    const user = await irAAudio();

    await user.click(screen.getByLabelText('Apps específicas'));
    await user.selectOptions(screen.getByLabelText('Añadir app'), 'Spotify.exe');
    await user.click(screen.getByRole('button', { name: 'Añadir' }));

    const fila = await screen.findByLabelText('Spotify.exe');
    expect(fila).toBeChecked();

    // Desmarcar desactiva la captura pero la app sigue en la lista.
    await user.click(fila);
    expect(screen.getByLabelText('Spotify.exe')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Quitar Spotify.exe' })).toBeInTheDocument();

    // El basurero sí la quita.
    await user.click(screen.getByRole('button', { name: 'Quitar Spotify.exe' }));
    expect(screen.queryByLabelText('Spotify.exe')).not.toBeInTheDocument();
  });

  it('con 3 apps de audio activas bloquea marcar una 4.ª y avisa del tope de pistas', async () => {
    mock().capture.getSettings.mockResolvedValue({
      ...DEFAULT_CAPTURE_SETTINGS,
      audioMode: 'apps',
      audioApps: [
        { executable: 'Spotify.exe', volume: 100, enabled: true },
        { executable: 'opera.exe', volume: 100, enabled: true },
        { executable: 'chrome.exe', volume: 100, enabled: true },
        { executable: 'firefox.exe', volume: 100, enabled: false },
      ],
    });
    await irAAudio();

    expect(screen.getByText(/Máximo 3 apps con audio/)).toBeInTheDocument();
    // La 4.ª (desmarcada) no se puede activar con el tope alcanzado.
    expect(screen.getByLabelText('firefox.exe')).toBeDisabled();
    // Discord (fija, desmarcada) tampoco.
    expect(screen.getByLabelText('Discord.exe')).toBeDisabled();
    // Una activa sí se puede desmarcar para liberar su pista.
    expect(screen.getByLabelText('Spotify.exe')).not.toBeDisabled();
  });

  it('guarda push to talk con su tecla y la supresión de ruido', async () => {
    const user = await irAAudio();

    await user.click(screen.getByLabelText(/Push to talk/));
    await user.selectOptions(screen.getByLabelText('Tecla de push to talk'), 'Mouse4');
    await user.click(screen.getByLabelText('Supresión de ruido (RNNoise)'));
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(await screen.findByText('Ajustes guardados ✓')).toBeInTheDocument();
    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        pttEnabled: true,
        pttHotkey: 'Mouse4',
        noiseSuppressionEnabled: true,
      }),
    );
  });

  it('con el hook no disponible deshabilita PTT y muestra el aviso', async () => {
    mock().capture.getPttAvailable.mockResolvedValueOnce(false);
    const user = await irAAudio();

    expect(screen.getByLabelText(/Push to talk/)).toBeDisabled();
    expect(screen.getByText(/hook global de teclado no está disponible/)).toBeInTheDocument();
    void user;
  });
});

describe('Ajustes — Desarrollo', () => {
  it('desactivar la aceleración por hardware se guarda y avisa del reinicio', async () => {
    const user = await irAAjustes();
    await user.click(screen.getByRole('link', { name: 'Desarrollo' }));

    const toggle = await screen.findByLabelText('Aceleración por hardware');
    expect(toggle).toBeChecked();
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(await screen.findByText('Ajustes guardados ✓')).toBeInTheDocument();
    expect(screen.getByText(/al reiniciar GameClip/)).toBeInTheDocument();
    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ hardwareAcceleration: false }),
    );
  });

  it('el desplegable de detección lista el índice y arranca colapsado', async () => {
    mock().games.getIndex.mockResolvedValue({
      lion: '2XKO',
      'lion-win64-shipping': '2XKO',
      pioneergame: 'ARC Raiders',
    });
    const user = await irAAjustes();
    await user.click(screen.getByRole('link', { name: 'Desarrollo' }));

    // 2 juegos distintos (2XKO, ARC Raiders) de 3 ejecutables.
    const resumen = await screen.findByText(/2 juegos · 3 ejecutables/);
    expect(resumen.closest('details')).not.toHaveAttribute('open'); // colapsado por defecto
    // La tabla se puebla con el mapa ejecutable → juego.
    expect(screen.getByText('pioneergame.exe')).toBeInTheDocument();
    expect(screen.getByText('ARC Raiders')).toBeInTheDocument();
  });
});

describe('Ajustes — Almacenamiento', () => {
  async function irAAlmacenamiento() {
    const user = await irAAjustes();
    await user.click(screen.getByRole('link', { name: 'Almacenamiento' }));
    await screen.findByRole('button', { name: 'Cambiar…' });
    return user;
  }

  it('el botón de carpeta usa pickOutputDir y muestra la ruta elegida', async () => {
    mock().capture.pickOutputDir.mockResolvedValueOnce('D:\\Clips');
    const user = await irAAlmacenamiento();

    await user.click(screen.getByRole('button', { name: 'Cambiar…' }));

    expect(await screen.findByLabelText('Carpeta')).toHaveValue('D:\\Clips');
  });

  it('renderiza la barra de uso de disco con las estadísticas', async () => {
    await irAAlmacenamiento();

    // formatStorage (compartido con el indicador del sidebar) no arrastra el decimal .0
    expect(await screen.findByText('Clips: 20 GB')).toBeInTheDocument();
    expect(screen.getByText('Grabaciones: 10 GB')).toBeInTheDocument();
    expect(screen.getByText('Otros: 10 GB')).toBeInTheDocument();
    expect(screen.getByText('Libre: 60 GB')).toBeInTheDocument();
  });

  it('oculta la barra de uso si la API de estadísticas falla', async () => {
    // Rechaza siempre: el indicador del sidebar también pide las stats.
    mock().library.getStorageStats.mockRejectedValue(new Error('sin acceso al disco'));
    await irAAlmacenamiento();

    expect(screen.queryByText(/Clips: /)).not.toBeInTheDocument();
  });
});

describe('Ajustes — Avanzado', () => {
  it('cambiar aspectRatio se refleja en el guardado', async () => {
    const user = await irAAjustes();
    await user.click(screen.getByRole('link', { name: 'Avanzado' }));
    await screen.findByLabelText('Mostrar cursor del mouse');

    await user.selectOptions(screen.getByLabelText('Relación de aspecto'), 'stretch169');
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ aspectRatio: 'stretch169' }),
    );
  });
});
