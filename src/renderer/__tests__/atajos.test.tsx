import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_CAPTURE_SETTINGS } from '@shared/capture';
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

/** Renderiza la app con sesión activa y navega a Ajustes → Atajos. */
async function irAAtajos() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('link', { name: 'Ajustes' }));
  await user.click(await screen.findByRole('link', { name: 'Atajos' }));
  await screen.findByText('Atajos de teclado y ratón');
  return user;
}

/**
 * Consultas acotadas a la lista de atajos: la barra de captura tiene sus propios botones
 * ("Guardar clip", "Grabar"), y sin acotar las búsquedas serían ambiguas.
 */
function lista() {
  return within(document.querySelector('.hotkey-list') as HTMLElement);
}

/** Botón de edición de la fila de una acción (cada fila describe su botón con la acción). */
function botonEditar(accion: string) {
  return lista()
    .getAllByRole('button', { name: 'Editar atajo…' })
    .find((b) => b.getAttribute('aria-describedby')?.includes(accion))!;
}

describe('Ajustes — Atajos', () => {
  it('lista las acciones con la tecla que tienen configurada', async () => {
    await irAAtajos();

    for (const accion of ['Guardar clip', 'Grabar / detener', 'Captura de pantalla', 'Cambiar de juego']) {
      expect(lista().getByText(accion)).toBeInTheDocument();
    }
    // Defaults: F8 clip · F7 grabar · F6 captura · F10 cambio de juego.
    for (const tecla of ['F8', 'F7', 'F6', 'F10']) {
      expect(lista().getByText(tecla)).toBeInTheDocument();
    }
  });

  it('captura la combinación pulsada y la guarda', async () => {
    const user = await irAAtajos();

    await user.click(botonEditar('replayHotkey'));
    expect(lista().getByText('Pulsa una combinación…')).toBeInTheDocument();

    await user.keyboard('{Alt>}c{/Alt}');
    expect(lista().getByText('Alt+C')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    expect(await screen.findByText('Ajustes guardados ✓')).toBeInTheDocument();
    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ replayHotkey: 'Alt+C' }),
    );
  });

  it('Esc cancela la captura sin cambiar la tecla', async () => {
    const user = await irAAtajos();

    await user.click(botonEditar('recordingHotkey'));
    await user.keyboard('{Escape}');

    expect(lista().queryByText('Pulsa una combinación…')).not.toBeInTheDocument();
    expect(lista().getByText('F7')).toBeInTheDocument(); // sigue el default
  });

  it('la tecla del push to talk está reservada: se rechaza al capturarla', async () => {
    const user = await irAAtajos();

    await user.click(botonEditar('recordingHotkey'));
    await user.keyboard('{F9}'); // F9 es el push to talk por defecto

    expect(screen.getByText(/reservada para el push to talk/)).toBeInTheDocument();
    expect(lista().getByText('Pulsa una combinación…')).toBeInTheDocument(); // sigue escuchando
    expect(lista().queryByText('F9')).not.toBeInTheDocument();
  });

  it('dos acciones con la misma tecla marcan colisión y bloquean el guardado', async () => {
    const user = await irAAtajos();

    await user.click(botonEditar('recordingHotkey'));
    await user.keyboard('{F8}'); // F8 ya es el de guardar clip

    expect(screen.getByRole('button', { name: 'Guardar ajustes' })).toBeDisabled();
    expect(screen.getByText(/no pueden compartir la misma tecla/)).toBeInTheDocument();
    expect(mock().capture.setSettings).not.toHaveBeenCalled();
  });

  it('activa el botón de captura de mandos y lo guarda', async () => {
    const user = await irAAtajos();

    const check = screen.getByRole('checkbox', { name: /Habilitar botón de captura de mandos/ });
    expect(check).not.toBeChecked();
    await user.click(check);

    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    expect(await screen.findByText('Ajustes guardados ✓')).toBeInTheDocument();
    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ controllerCaptureEnabled: true }),
    );
  });

  it('un botón lateral del ratón se asigna como atajo (con modificadores) y se guarda', async () => {
    const user = await irAAtajos();

    await user.click(botonEditar('replayHotkey'));
    // DOM: 3 = atrás → Mouse4. La pulsación queda consumida (no navega ni llega a la página).
    expect(fireEvent.mouseDown(window, { button: 3 })).toBe(false);
    expect(lista().getByText('Mouse4')).toBeInTheDocument();

    await user.click(botonEditar('recordingHotkey'));
    fireEvent.mouseDown(window, { button: 4, ctrlKey: true });
    expect(lista().getByText('Ctrl+Mouse5')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    expect(await screen.findByText('Ajustes guardados ✓')).toBeInTheDocument();
    expect(mock().capture.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ replayHotkey: 'Mouse4', recordingHotkey: 'Ctrl+Mouse5' }),
    );
  });

  it('el botón derecho o el central avisan y no asignan nada; el izquierdo cancela como siempre', async () => {
    const user = await irAAtajos();

    await user.click(botonEditar('replayHotkey'));
    expect(fireEvent.mouseDown(window, { button: 2 })).toBe(false);
    expect(fireEvent.contextMenu(window)).toBe(false); // sin menú contextual mientras escucha
    expect(screen.getByText(/solo sirven los botones laterales/)).toBeInTheDocument();
    fireEvent.mouseDown(window, { button: 1 });
    expect(lista().getByText('Pulsa una combinación…')).toBeInTheDocument(); // sigue escuchando

    await user.click(lista().getByRole('button', { name: 'Cancelar' }));
    expect(lista().queryByText('Pulsa una combinación…')).not.toBeInTheDocument();
    expect(lista().getByText('F8')).toBeInTheDocument();
    expect(screen.queryByText(/solo sirven los botones laterales/)).not.toBeInTheDocument();
  });

  it('con el push to talk en un botón del ratón, ese botón queda reservado', async () => {
    mock().capture.getSettings.mockResolvedValue({ ...DEFAULT_CAPTURE_SETTINGS, pttHotkey: 'Mouse4' });
    const user = await irAAtajos();

    await user.click(botonEditar('replayHotkey'));
    fireEvent.mouseDown(window, { button: 3 });
    expect(screen.getByText(/Mouse4 está reservada para el push to talk/)).toBeInTheDocument();
    expect(lista().getByText('Pulsa una combinación…')).toBeInTheDocument();
  });

  it('sin capturar, los botones del ratón no tocan los atajos', async () => {
    await irAAtajos();
    fireEvent.mouseDown(window, { button: 3 });
    expect(lista().queryByText('Mouse4')).not.toBeInTheDocument();
    expect(lista().getByText('F8')).toBeInTheDocument();
  });

  it('los botones atrás/adelante del ratón no cambian de pantalla', async () => {
    await irAAtajos();
    const ruta = window.location.hash;

    expect(fireEvent.mouseUp(window, { button: 3 })).toBe(false); // preventDefault: Chromium no navega
    expect(fireEvent.mouseUp(window, { button: 4 })).toBe(false);
    expect(fireEvent.mouseUp(window, { button: 0 })).toBe(true); // el resto de clics, intactos
    expect(window.location.hash).toBe(ruta);
    expect(screen.getByText('Atajos de teclado y ratón')).toBeInTheDocument();
  });

  it('restablecer devuelve los atajos a sus valores por defecto', async () => {
    const user = await irAAtajos();

    await user.click(botonEditar('screenshotHotkey'));
    await user.keyboard('{Alt>}k{/Alt}');
    expect(lista().getByText('Alt+K')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restablecer atajos por defecto' }));
    expect(lista().queryByText('Alt+K')).not.toBeInTheDocument();
    expect(lista().getByText('F6')).toBeInTheDocument();
  });
});
