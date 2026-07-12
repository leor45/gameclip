import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Biblioteca from '../views/Biblioteca';
import { crearClip } from './helpers';
import { crearGameclipMock } from './setup';

type GameclipMock = ReturnType<typeof crearGameclipMock>;

function mock(): GameclipMock {
  return window.gameclip as unknown as GameclipMock;
}

beforeEach(() => {
  Object.defineProperty(window, 'gameclip', { writable: true, value: crearGameclipMock() });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Biblioteca — grilla', () => {
  it('muestra los clips con título, juego, duración y etiquetas', async () => {
    mock().library.list.mockResolvedValue([
      crearClip({ title: 'Ace en Ascent', game: 'Valorant', tags: ['ace'], durationSeconds: 83 }),
      crearClip({ title: 'Gol de media cancha', game: 'Rocket League' }),
    ]);
    render(<Biblioteca />);

    expect(await screen.findByText('Ace en Ascent')).toBeInTheDocument();
    expect(screen.getByText('Gol de media cancha')).toBeInTheDocument();
    expect(screen.getByText(/Valorant/)).toBeInTheDocument();
    expect(screen.getByText('1:23')).toBeInTheDocument();
    expect(screen.getByText('ace')).toBeInTheDocument();
  });

  it('sin clips muestra el estado vacío', async () => {
    render(<Biblioteca />);
    expect(await screen.findByText(/Aún no hay clips/)).toBeInTheDocument();
  });

  it('se suscribe a los cambios del catálogo', async () => {
    render(<Biblioteca />);
    await screen.findByText(/Aún no hay clips/);
    expect(mock().library.onChanged).toHaveBeenCalled();
  });
});

describe('Biblioteca — búsqueda y filtros', () => {
  it('la búsqueda consulta con el texto escrito', async () => {
    const user = userEvent.setup();
    render(<Biblioteca />);
    await screen.findByText(/Aún no hay clips/);

    await user.type(screen.getByLabelText('Buscar clips'), 'ace');

    await waitFor(() => {
      expect(mock().library.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'ace' }),
      );
    });
  });

  it('el chip de favoritos consulta favoritesOnly', async () => {
    const user = userEvent.setup();
    render(<Biblioteca />);
    await screen.findByText(/Aún no hay clips/);

    await user.click(screen.getByRole('button', { name: '★ Favoritos' }));

    await waitFor(() => {
      expect(mock().library.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ favoritesOnly: true }),
      );
    });
  });

  it('el filtro de juego lista los juegos y consulta por el elegido', async () => {
    const user = userEvent.setup();
    mock().library.games.mockResolvedValue(['CS2', 'Valorant']);
    render(<Biblioteca />);
    await screen.findByRole('option', { name: 'Valorant' });

    await user.selectOptions(screen.getByLabelText('Filtrar por juego'), 'Valorant');

    await waitFor(() => {
      expect(mock().library.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ game: 'Valorant', withoutGame: false }),
      );
    });
  });

  it('el filtro "Escritorio" pide los clips sin juego, no un juego llamado así', async () => {
    const user = userEvent.setup();
    mock().library.games.mockResolvedValue(['CS2']);
    render(<Biblioteca />);
    await screen.findByRole('option', { name: 'Escritorio' });

    await user.selectOptions(screen.getByLabelText('Filtrar por juego'), 'Escritorio');

    await waitFor(() => {
      expect(mock().library.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ withoutGame: true, game: undefined }),
      );
    });
  });
});

describe('Biblioteca — acciones', () => {
  it('marcar favorito llama a update con el valor invertido', async () => {
    const user = userEvent.setup();
    const clip = crearClip({ title: 'Para favorito' });
    mock().library.list.mockResolvedValue([clip]);
    render(<Biblioteca />);

    await user.click(await screen.findByRole('button', { name: 'Marcar favorito' }));

    expect(mock().library.update).toHaveBeenCalledWith(clip.id, { favorite: true });
  });

  it('renombrar y etiquetar guarda título y tags', async () => {
    const user = userEvent.setup();
    const clip = crearClip({ title: 'Nombre viejo' });
    mock().library.list.mockResolvedValue([clip]);
    render(<Biblioteca />);

    await user.click(await screen.findByRole('button', { name: 'Renombrar y etiquetar' }));
    const inputTitulo = screen.getByLabelText('Título');
    await user.clear(inputTitulo);
    await user.type(inputTitulo, 'Nombre nuevo');
    await user.type(screen.getByLabelText('Etiquetas (separadas por coma)'), 'ace, clutch');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(mock().library.update).toHaveBeenCalledWith(clip.id, {
      title: 'Nombre nuevo',
      tags: ['ace', 'clutch'],
    });
  });

  it('eliminar pide confirmación y llama a remove', async () => {
    const user = userEvent.setup();
    const clip = crearClip({ title: 'Para borrar' });
    mock().library.list.mockResolvedValue([clip]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Biblioteca />);

    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Para borrar'));
    expect(mock().library.remove).toHaveBeenCalledWith(clip.id);
  });

  it('si no se confirma, no elimina', async () => {
    const user = userEvent.setup();
    mock().library.list.mockResolvedValue([crearClip()]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Biblioteca />);

    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));

    expect(mock().library.remove).not.toHaveBeenCalled();
  });

  it('el botón Editar navega al editor del clip', async () => {
    const user = userEvent.setup();
    const clip = crearClip();
    mock().library.list.mockResolvedValue([clip]);
    render(<Biblioteca />);

    await user.click(await screen.findByRole('button', { name: 'Editar' }));

    expect(window.location.hash).toBe(`#/editor/${clip.id}`);
  });

  it('abrir carpeta llama a openFolder', async () => {
    const user = userEvent.setup();
    const clip = crearClip();
    mock().library.list.mockResolvedValue([clip]);
    render(<Biblioteca />);

    await user.click(await screen.findByRole('button', { name: 'Abrir carpeta' }));

    expect(mock().library.openFolder).toHaveBeenCalledWith(clip.id);
  });
});

describe('Biblioteca — reproducción', () => {
  it('clic en la tarjeta abre el reproductor y se puede cerrar', async () => {
    const user = userEvent.setup();
    const clip = crearClip({ title: 'Jugadón' });
    mock().library.list.mockResolvedValue([clip]);
    render(<Biblioteca />);

    await user.click(await screen.findByRole('button', { name: 'Reproducir Jugadón' }));

    const dialogo = screen.getByRole('dialog', { name: 'Jugadón' });
    expect(dialogo).toBeInTheDocument();
    expect(dialogo.querySelector('video')?.getAttribute('src')).toBe(
      `gameclip-media://clip/${clip.id}`,
    );

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
