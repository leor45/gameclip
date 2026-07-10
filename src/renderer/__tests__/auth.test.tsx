import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { jsonResponse, sesionFalsa } from './helpers';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('autenticación en la app', () => {
  it('sin sesión muestra el login y no el shell', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Biblioteca' })).not.toBeInTheDocument();
  });

  it('con sesión persistida entra directo al shell', () => {
    localStorage.setItem('gameclip.session', JSON.stringify(sesionFalsa));
    render(<App />);

    expect(screen.getByRole('link', { name: 'Biblioteca' })).toBeInTheDocument();
    expect(screen.getByText('Leo')).toBeInTheDocument();
  });

  it('login exitoso guarda la sesión y entra al shell', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, sesionFalsa)),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('Email'), 'leo@gameclip.test');
    await user.type(screen.getByLabelText('Contraseña'), 'contraseña-segura');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('link', { name: 'Biblioteca' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('gameclip.session')!)).toEqual(sesionFalsa);
  });

  it('muestra el error del server cuando las credenciales son incorrectas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { error: 'Email o contraseña incorrectos.' })),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('Email'), 'leo@gameclip.test');
    await user.type(screen.getByLabelText('Contraseña'), 'incorrecta-123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Email o contraseña incorrectos.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Biblioteca' })).not.toBeInTheDocument();
  });

  it('cambia entre login y registro', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Regístrate/ }));
    expect(screen.getByRole('heading', { name: 'Crear cuenta' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Inicia sesión/ }));
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('logout vuelve al login y limpia la sesión persistida', async () => {
    localStorage.setItem('gameclip.session', JSON.stringify(sesionFalsa));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(localStorage.getItem('gameclip.session')).toBeNull();
  });
});
