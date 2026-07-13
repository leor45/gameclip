import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateCheckResult } from '@shared/ipc';
import { AuthProvider } from '../auth/AuthContext';
import Sidebar from '../components/Sidebar';
import UpdateModal from '../components/UpdateModal';
import { UpdateProvider } from '../updates/UpdateContext';
import { crearGameclipMock } from './setup';

type GameclipMock = ReturnType<typeof crearGameclipMock>;

function mock(): GameclipMock {
  return window.gameclip as unknown as GameclipMock;
}

beforeEach(() => {
  Object.defineProperty(window, 'gameclip', { writable: true, value: crearGameclipMock() });
});

function conChequeo(result: Partial<UpdateCheckResult>): void {
  mock().checkForUpdate.mockResolvedValue({
    current: '0.5.1',
    latest: null,
    updateAvailable: false,
    url: 'https://github.com/leor45/gameclip/releases/latest',
    ...result,
  });
}

function renderSidebar() {
  return render(
    <AuthProvider>
      <UpdateProvider>
        <MemoryRouter>
          <Sidebar versionInfo={null} />
        </MemoryRouter>
      </UpdateProvider>
    </AuthProvider>,
  );
}

describe('Comprobar actualizaciones — sidebar', () => {
  it('comprueba al arrancar y, si no hay update, no muestra el aviso pasivo', async () => {
    conChequeo({ updateAvailable: false });
    renderSidebar();

    await waitFor(() => expect(mock().checkForUpdate).toHaveBeenCalled());
    expect(screen.queryByText(/Actualización disponible/)).not.toBeInTheDocument();
  });

  it('muestra el aviso pasivo cuando hay una versión nueva', async () => {
    conChequeo({ updateAvailable: true, latest: '0.6.0' });
    renderSidebar();

    expect(await screen.findByText(/Actualización disponible: v0\.6\.0/)).toBeInTheDocument();
  });

  it('el aviso pasivo abre el release en el navegador', async () => {
    const user = userEvent.setup();
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    conChequeo({
      updateAvailable: true,
      latest: '0.6.0',
      url: 'https://github.com/leor45/gameclip/releases/tag/v0.6.0',
    });
    renderSidebar();

    await user.click(await screen.findByText(/Actualización disponible/));

    expect(abrir).toHaveBeenCalledWith('https://github.com/leor45/gameclip/releases/tag/v0.6.0');
  });

  it('el botón manual da feedback "Estás al día" cuando no hay update', async () => {
    const user = userEvent.setup();
    conChequeo({ updateAvailable: false });
    renderSidebar();

    await user.click(screen.getByRole('button', { name: 'Comprobar actualizaciones' }));

    expect(await screen.findByText('Estás al día ✓')).toBeInTheDocument();
    // Un chequeo de arranque + el manual.
    expect(mock().checkForUpdate).toHaveBeenCalledTimes(2);
  });
});

describe('Comprobar actualizaciones — modal de arranque', () => {
  function renderModal() {
    return render(
      <UpdateProvider>
        <UpdateModal />
      </UpdateProvider>,
    );
  }

  it('no aparece si no hay update', async () => {
    conChequeo({ updateAvailable: false });
    renderModal();

    await waitFor(() => expect(mock().checkForUpdate).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('aparece al arrancar con update y "Ver release" abre el enlace y lo cierra', async () => {
    const user = userEvent.setup();
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    conChequeo({
      updateAvailable: true,
      latest: '0.6.0',
      url: 'https://github.com/leor45/gameclip/releases/tag/v0.6.0',
    });
    renderModal();

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/v0\.6\.0/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ver release' }));

    expect(abrir).toHaveBeenCalledWith('https://github.com/leor45/gameclip/releases/tag/v0.6.0');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('"Ahora no" lo cierra sin abrir nada', async () => {
    const user = userEvent.setup();
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    conChequeo({ updateAvailable: true, latest: '0.6.0' });
    renderModal();

    await user.click(await screen.findByRole('button', { name: 'Ahora no' }));

    expect(abrir).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
