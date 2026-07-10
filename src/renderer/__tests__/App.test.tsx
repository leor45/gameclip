import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../App';

describe('App', () => {
  it('muestra la navegación y arranca en Biblioteca', async () => {
    render(<App />);

    expect(screen.getByRole('link', { name: 'Biblioteca' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Editor' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ajustes' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Biblioteca' })).toBeInTheDocument();
  });

  it('navega a Ajustes al hacer clic en el enlace', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('link', { name: 'Ajustes' }));

    expect(await screen.findByRole('heading', { name: 'Ajustes' })).toBeInTheDocument();
  });

  it('muestra la versión obtenida por IPC en el pie de la barra lateral', async () => {
    render(<App />);

    expect(await screen.findByText(/v0\.0\.0-test · Electron 29\.3\.1/)).toBeInTheDocument();
  });
});
