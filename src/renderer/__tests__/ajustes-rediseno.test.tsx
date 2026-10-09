import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CAPTURE_SETTINGS } from '@shared/capture';
import App from '../App';
import { clearIconCache } from '../lib/useIcon';
import AjustesGeneral from '../views/ajustes/General';
import { sesionFalsa } from './helpers';
import { crearGameclipMock } from './setup';

type GameclipMock = ReturnType<typeof crearGameclipMock>;

function mock(): GameclipMock {
  return window.gameclip as unknown as GameclipMock;
}

beforeEach(() => {
  localStorage.setItem('gameclip.session', JSON.stringify(sesionFalsa));
  Object.defineProperty(window, 'gameclip', { writable: true, value: crearGameclipMock() });
  clearIconCache();
});

async function irAAjustes() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('link', { name: 'Ajustes' }));
  await screen.findByRole('link', { name: 'General' });
  return user;
}

describe('Ajustes — pie fijo', () => {
  const SECCIONES = [
    'Grabación',
    'General',
    'Calidad',
    'Audio',
    'Atajos',
    'Almacenamiento',
    'Avanzado',
    'Desarrollo',
  ];

  it('las 8 secciones tienen «Guardar ajustes» en el pie, fuera del área con scroll', async () => {
    const user = await irAAjustes();
    for (const seccion of SECCIONES) {
      await user.click(screen.getByRole('link', { name: seccion }));
      // El titular de la sección confirma que ya cargó.
      await screen.findByRole('heading', { name: seccion, level: 2 });
      const boton = screen.getByRole('button', { name: 'Guardar ajustes' });
      expect(boton.closest('.settings-savebar')).not.toBeNull();
      expect(boton.closest('.settings-scroll')).toBeNull();
      // Y los campos sí van dentro del área con scroll.
      const scroll = document.querySelector('.settings-form .settings-scroll');
      expect(scroll?.querySelector('fieldset')).not.toBeNull();
    }
  });
});

describe('Ajustes — llegada a General desde la barra superior', () => {
  /** Muestra el state actual de la navegación, para comprobar que se limpia tras usarlo. */
  function EstadoActual() {
    const location = useLocation();
    return <output data-testid="estado">{JSON.stringify(location.state ?? null)}</output>;
  }

  function renderGeneral(state: unknown) {
    return render(
      <MemoryRouter initialEntries={[{ pathname: '/ajustes/general', state }]}>
        <Routes>
          <Route
            path="/ajustes/general"
            element={
              <>
                <AjustesGeneral />
                <EstadoActual />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('con state.focus enfoca la duración del buffer, la marca y limpia el state', async () => {
    renderGeneral({ focus: 'replaySeconds' });

    const campo = await screen.findByLabelText('Duración del buffer (segundos)');
    await waitFor(() => expect(campo).toHaveFocus());
    expect(campo.closest('label')).toHaveClass('is-marked');
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('null'));
    // Al limpiar el state no se vuelve a dar el foco ni se pierde la marca de golpe.
    expect(campo).toHaveFocus();
  });

  it('la marca se va sola pasado un momento', async () => {
    renderGeneral({ focus: 'replaySeconds' });
    const campo = await screen.findByLabelText('Duración del buffer (segundos)');
    await waitFor(() => expect(campo.closest('label')).toHaveClass('is-marked'));
    await waitFor(() => expect(campo.closest('label')).not.toHaveClass('is-marked'), {
      timeout: 2500,
    });
  });

  it('sin state no enfoca ni marca nada', async () => {
    renderGeneral(null);

    const campo = await screen.findByLabelText('Duración del buffer (segundos)');
    expect(campo).not.toHaveFocus();
    expect(campo.closest('label')).not.toHaveClass('is-marked');
  });
});

describe('Ajustes — iconos en listas y mezcla', () => {
  it('«Audio del juego» y «Micrófono» llevan iconos fijos; las apps, el de su ejecutable', async () => {
    mock().capture.getSettings.mockResolvedValue({ ...DEFAULT_CAPTURE_SETTINGS, audioMode: 'apps' });
    const user = await irAAjustes();
    await user.click(screen.getByRole('link', { name: 'Audio' }));
    const juego = await screen.findByLabelText('Audio del juego');

    expect(juego.closest('li')?.querySelector('[data-icon="pad"]')).not.toBeNull();
    expect(
      screen.getByLabelText('Micrófono').closest('li')?.querySelector('[data-icon="mic"]'),
    ).not.toBeNull();
    // Discord (fila fija de app) sí pide el icono de su ejecutable.
    await waitFor(() => expect(mock().icons.forExe).toHaveBeenCalledWith('Discord.exe'));
    // Los iconos fijos nunca piden el del juego detectado ni el de un ejecutable.
    expect(mock().icons.forGame).not.toHaveBeenCalled();
    expect(mock().icons.forExe.mock.calls.map((c) => c[0])).toEqual(['Discord.exe']);
  });

  it('en modo escritorio, «Audio del escritorio» lleva el monitor y «Micrófono» el micro', async () => {
    const user = await irAAjustes();
    await user.click(screen.getByRole('link', { name: 'Audio' }));
    await user.click(await screen.findByLabelText('Todo el escritorio'));

    const escritorio = screen.getByLabelText('Audio del escritorio');
    expect(escritorio.closest('li')?.querySelector('[data-icon="desktop"]')).not.toBeNull();
    expect(
      screen.getByLabelText('Micrófono').closest('li')?.querySelector('[data-icon="mic"]'),
    ).not.toBeNull();
    expect(mock().icons.forGame).not.toHaveBeenCalled();
  });

  it('cada juego añadido a mano pide el icono de su ejecutable', async () => {
    mock().capture.getSettings.mockResolvedValue({
      ...DEFAULT_CAPTURE_SETTINGS,
      customGames: [{ executable: 'MilesMorales.exe', name: 'Spiderman' }, { executable: 'Otro.exe' }],
    });
    const user = await irAAjustes();
    await user.click(screen.getByRole('link', { name: 'Grabación' }));
    await screen.findByText('Spiderman');

    await waitFor(() => {
      expect(mock().icons.forExe).toHaveBeenCalledWith('MilesMorales.exe');
      expect(mock().icons.forExe).toHaveBeenCalledWith('Otro.exe');
    });
  });

  it('cada entrada de «No son juegos» pide el icono por su nombre', async () => {
    mock().capture.getSettings.mockResolvedValue({
      ...DEFAULT_CAPTURE_SETTINGS,
      excludedGames: [{ name: 'Wallpaper Engine', source: 'auto', enabled: false }],
    });
    const user = await irAAjustes();
    await user.click(screen.getByRole('link', { name: 'Grabación' }));
    const casilla = await screen.findByLabelText('Excluir Wallpaper Engine');

    await waitFor(() => expect(mock().icons.forGame).toHaveBeenCalledWith('Wallpaper Engine'));
    // Desactivada se ve tachada.
    expect(casilla.closest('li')).toHaveClass('is-off');
  });
});
