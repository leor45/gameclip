import { render, screen } from '@testing-library/react';
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

/** Renderiza la app con sesión activa y navega a /ajustes (que redirige a General). */
async function irAAjustes() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('link', { name: 'Ajustes' }));
  await screen.findByLabelText('Duración del buffer (segundos)');
  return user;
}

describe('Ajustes — navegación', () => {
  it('redirige /ajustes a General y navega entre secciones', async () => {
    const user = await irAAjustes();

    expect(screen.getByRole('link', { name: 'General' })).toHaveClass('active');

    await user.click(screen.getByRole('link', { name: 'Calidad' }));
    expect(await screen.findByRole('button', { name: /Alta/ })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Audio' }));
    expect(await screen.findByLabelText('Capturar micrófono')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Almacenamiento' }));
    expect(await screen.findByRole('button', { name: 'Cambiar…' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Avanzado' }));
    expect(await screen.findByLabelText('Mostrar cursor del mouse')).toBeInTheDocument();
  });
});

describe('Ajustes — General', () => {
  it('guarda los cambios de la sección con la API', async () => {
    const user = await irAAjustes();

    const buffer = screen.getByLabelText('Duración del buffer (segundos)');
    await user.clear(buffer);
    await user.type(buffer, '90');
    const hotkey = screen.getByLabelText('Hotkey para guardar clip');
    await user.clear(hotkey);
    await user.type(hotkey, 'F9');
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(await screen.findByText('Ajustes guardados ✓')).toBeInTheDocument();
    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ replaySeconds: 90, replayHotkey: 'F9' }),
    );
  });

  it('guarda los toggles de comportamiento (bufferMode, overlay, autoLaunch)', async () => {
    const user = await irAAjustes();

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
    await screen.findByLabelText('Capturar micrófono');
    return user;
  }

  it('permite añadir y quitar una app de la lista en modo apps', async () => {
    const user = await irAAudio();

    await user.click(screen.getByLabelText('Apps específicas'));
    await user.selectOptions(screen.getByLabelText('Añadir app'), 'Discord.exe');
    await user.click(screen.getByRole('button', { name: 'Añadir' }));

    expect(await screen.findByText('Discord.exe')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(screen.queryByText('Discord.exe')).not.toBeInTheDocument();
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

    expect(await screen.findByText('Clips: 20.0 GB')).toBeInTheDocument();
    expect(screen.getByText('Grabaciones: 10.0 GB')).toBeInTheDocument();
    expect(screen.getByText('Otros: 10.0 GB')).toBeInTheDocument();
    expect(screen.getByText('Libre: 60.0 GB')).toBeInTheDocument();
  });

  it('oculta la barra de uso si la API de estadísticas falla', async () => {
    mock().library.getStorageStats.mockRejectedValueOnce(new Error('sin acceso al disco'));
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
