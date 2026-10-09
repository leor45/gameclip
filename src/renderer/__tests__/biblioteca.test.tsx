import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Biblioteca from '../views/Biblioteca';
import { crearClip } from './helpers';
import { crearGameclipMock } from './setup';

/** jsdom no trae matchMedia: la preview lo consulta para respetar prefers-reduced-motion. */
function matchMediaFalso(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({ matches: reduce, media: query }),
  });
}

type GameclipMock = ReturnType<typeof crearGameclipMock>;

function mock(): GameclipMock {
  return window.gameclip as unknown as GameclipMock;
}

type Usuario = ReturnType<typeof userEvent.setup>;

/** Contadores del catálogo como los da `library.gameStats()`: de más a menos clips. */
const STATS = {
  total: 48,
  desktop: 5,
  games: [
    { name: 'Valorant', count: 14 },
    { name: 'CS2', count: 9 },
    { name: 'Pokémon Escarlata', count: 2 },
  ],
};

function botonFiltro(): HTMLElement {
  return screen.getByRole('button', { name: /^Filtrar por juego/ });
}

/** Abre el filtro de juego (espera a que carguen los contadores) y devuelve el listbox. */
async function abrirFiltro(user: Usuario): Promise<HTMLElement> {
  await waitFor(() => expect(mock().library.gameStats).toHaveBeenCalled());
  await user.click(await screen.findByRole('button', { name: /^Filtrar por juego/ }));
  return screen.getByRole('listbox', { name: 'Filtrar por juego' });
}

async function elegirJuego(user: Usuario, nombre: RegExp) {
  const lista = await abrirFiltro(user);
  await waitFor(() => expect(within(lista).getByRole('option', { name: nombre })).toBeInTheDocument());
  await user.click(within(lista).getByRole('option', { name: nombre }));
}

/** El panel reproductor (región con el título del clip abierto). */
function panel(titulo: string): HTMLElement {
  return screen.getByRole('region', { name: titulo });
}

beforeEach(() => {
  Object.defineProperty(window, 'gameclip', { writable: true, value: crearGameclipMock() });
});

afterEach(() => {
  // Desmontar ANTES de restaurar los mocks: restoreAllMocks deja los vi.fn sin implementación y un
  // efecto tardío (p. ej. el icono de un juego) llamaría a un forGame que devuelve undefined.
  cleanup();
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

describe('Biblioteca — card: tamaño, tooltips y basurero', () => {
  it('muestra el tamaño del archivo bajo la meta (vídeo y captura)', async () => {
    mock().library.list.mockResolvedValue([
      crearClip({ title: 'Vídeo', sizeBytes: 13_002_342 }),
      crearClip({ title: 'Captura', kind: 'image', sizeBytes: 348_160 }),
    ]);
    render(<Biblioteca />);

    expect(await screen.findByText('12.4 MB')).toBeInTheDocument();
    expect(screen.getByText('340 KB')).toBeInTheDocument();
  });

  it('los iconos de acción llevan tooltip (title)', async () => {
    mock().library.list.mockResolvedValue([crearClip({ title: 'Con tooltips' })]);
    render(<Biblioteca />);

    expect(await screen.findByRole('button', { name: 'Eliminar' })).toHaveAttribute(
      'title',
      'Eliminar',
    );
    expect(screen.getByRole('button', { name: 'Abrir carpeta' })).toHaveAttribute(
      'title',
      'Abrir carpeta',
    );
    expect(screen.getByRole('button', { name: 'Renombrar y etiquetar' })).toHaveAttribute('title');
  });

  it('el botón de eliminar es un basurero (svg), no la ✕, y conserva su aria-label', async () => {
    mock().library.list.mockResolvedValue([crearClip({ title: 'Con basurero' })]);
    render(<Biblioteca />);

    const btn = await screen.findByRole('button', { name: 'Eliminar' });
    expect(btn).toHaveClass('clip-trash');
    expect(btn.querySelector('svg')).toBeInTheDocument();
    expect(btn.textContent).not.toContain('✕');
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

  it('si el juego filtrado desaparece del catálogo, el filtro vuelve a «Todos los juegos»', async () => {
    // Regresión: borrar el último clip del juego filtrado dejaba el filtro aplicado («Sin
    // resultados») mientras el selector pintaba «Todos los juegos». Se suelta el filtro y se recarga.
    const user = userEvent.setup();
    let alCambiar: () => void = () => undefined;
    mock().library.onChanged.mockImplementation((cb: () => void) => {
      alCambiar = cb;
      return () => undefined;
    });
    mock().library.games.mockResolvedValue(['CS2', 'Valorant']);
    mock().library.gameStats.mockResolvedValue(STATS);
    render(<Biblioteca />);
    await elegirJuego(user, /^Valorant/);
    await waitFor(() =>
      expect(mock().library.list).toHaveBeenLastCalledWith(expect.objectContaining({ game: 'Valorant' })),
    );

    // Se borra el último clip de Valorant: el catálogo ya no lo lista.
    mock().library.games.mockResolvedValue(['CS2']);
    await act(async () => alCambiar());

    await waitFor(() =>
      expect(mock().library.list).toHaveBeenLastCalledWith(expect.objectContaining({ game: undefined })),
    );
    expect(botonFiltro()).toHaveAccessibleName('Filtrar por juego: Todos los juegos');
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

  it('eliminar pide confirmación en el modal propio y llama a remove', async () => {
    const user = userEvent.setup();
    const clip = crearClip({ title: 'Para borrar' });
    mock().library.list.mockResolvedValue([clip]);
    render(<Biblioteca />);

    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = screen.getByRole('alertdialog', { name: '¿Eliminar el clip?' });
    expect(within(dialogo).getByText('Para borrar')).toBeInTheDocument();
    await user.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    expect(mock().library.remove).toHaveBeenCalledWith(clip.id);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('si no se confirma, no elimina', async () => {
    const user = userEvent.setup();
    mock().library.list.mockResolvedValue([crearClip()]);
    render(<Biblioteca />);

    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
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

describe('Biblioteca — preview al pasar el cursor', () => {
  const RETARDO = 250;

  /** El cursor entra en la tarjeta y pasa el retardo de arranque. */
  async function apuntar(card: HTMLElement) {
    fireEvent.mouseEnter(card);
    await act(async () => {
      vi.advanceTimersByTime(RETARDO);
    });
  }

  function tarjetas(): HTMLElement[] {
    return Array.from(document.querySelectorAll('.clip-card'));
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // jsdom no reproduce video: play() no existe en HTMLMediaElement.
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    matchMediaFalso(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tras el retardo monta el video, mudo y sobre el thumbnail', async () => {
    const clip = crearClip({ id: 3, title: 'Con preview' });
    mock().library.list.mockResolvedValue([clip]);
    render(<Biblioteca />);
    const card = (await screen.findByText('Con preview')).closest('.clip-card') as HTMLElement;

    // Antes del retardo no hay nada: barrer la grilla no debe disparar previews.
    fireEvent.mouseEnter(card);
    expect(screen.queryByTestId('preview-3')).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(RETARDO);
    });

    const video = screen.getByTestId('preview-3') as HTMLVideoElement;
    expect(video).toBeInTheDocument();
    expect(video.muted).toBe(true);
    expect(video.getAttribute('src')).toBe(`gameclip-media://clip/${clip.id}`);
    expect(video.getAttribute('poster')).toContain('gameclip-media://thumb/3');
  });

  it('al salir el cursor, la preview MUERE (el video se desmonta, no se pausa)', async () => {
    mock().library.list.mockResolvedValue([crearClip({ id: 3, title: 'Con preview' })]);
    render(<Biblioteca />);
    const card = (await screen.findByText('Con preview')).closest('.clip-card') as HTMLElement;

    await apuntar(card);
    expect(screen.getByTestId('preview-3')).toBeInTheDocument();

    fireEvent.mouseLeave(card);

    expect(screen.queryByTestId('preview-3')).not.toBeInTheDocument();
    expect(document.querySelector('.clip-thumb img')).toBeInTheDocument(); // vuelve el thumbnail
  });

  it('la preview vuelve a empezar a los 10 s (bucle)', async () => {
    mock().library.list.mockResolvedValue([crearClip({ id: 3, title: 'Con preview' })]);
    render(<Biblioteca />);
    const card = (await screen.findByText('Con preview')).closest('.clip-card') as HTMLElement;
    await apuntar(card);

    const video = screen.getByTestId('preview-3') as HTMLVideoElement;
    video.currentTime = 10.2;
    fireEvent.timeUpdate(video);

    expect(video.currentTime).toBe(0);
  });

  it('solo hay UNA preview viva: apuntar otra tarjeta mata la anterior', async () => {
    mock().library.list.mockResolvedValue([
      crearClip({ id: 3, title: 'Primera' }),
      crearClip({ id: 4, title: 'Segunda' }),
    ]);
    render(<Biblioteca />);
    await screen.findByText('Primera');
    const [primera, segunda] = tarjetas();

    await apuntar(primera);
    expect(screen.getByTestId('preview-3')).toBeInTheDocument();

    // El cursor pasa a la otra tarjeta (mouseleave de la primera + enter en la segunda).
    fireEvent.mouseLeave(primera);
    await apuntar(segunda);

    expect(screen.queryByTestId('preview-3')).not.toBeInTheDocument();
    expect(screen.getByTestId('preview-4')).toBeInTheDocument();
  });

  it('con prefers-reduced-motion no se reproduce nada (queda el thumbnail)', async () => {
    matchMediaFalso(true);
    mock().library.list.mockResolvedValue([crearClip({ id: 3, title: 'Con preview' })]);
    render(<Biblioteca />);
    const card = (await screen.findByText('Con preview')).closest('.clip-card') as HTMLElement;

    await apuntar(card);

    expect(screen.queryByTestId('preview-3')).not.toBeInTheDocument();
  });
});

describe('Biblioteca — capturas de pantalla', () => {
  const captura = () =>
    crearClip({
      id: 7,
      title: 'Terraria Screenshot 2026.07.11 - 10.00.00.00',
      kind: 'image',
      game: 'Terraria',
      durationSeconds: 0,
    });

  it('la tarjeta de una captura no ofrece el editor (no hay nada que recortar)', async () => {
    mock().library.list.mockResolvedValue([captura(), crearClip({ title: 'Un clip' })]);
    render(<Biblioteca />);
    await screen.findByText('Un clip');

    // Un solo botón de editor en toda la grilla: el del video.
    expect(screen.getAllByRole('button', { name: 'Editar' })).toHaveLength(1);
    expect(screen.getByText('Captura')).toBeInTheDocument(); // en vez de la duración
  });

  it('el hover NO monta preview sobre una captura', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    matchMediaFalso(false);
    mock().library.list.mockResolvedValue([captura()]);
    render(<Biblioteca />);
    const card = (await screen.findByText(/Terraria Screenshot/)).closest(
      '.clip-card',
    ) as HTMLElement;

    fireEvent.mouseEnter(card);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByTestId('preview-7')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('al abrirla, el panel muestra la imagen y no un reproductor', async () => {
    const user = userEvent.setup();
    mock().library.list.mockResolvedValue([captura()]);
    render(<Biblioteca />);

    await user.click(
      await screen.findByRole('button', {
        name: 'Ver Terraria Screenshot 2026.07.11 - 10.00.00.00',
      }),
    );

    const visor = panel('Terraria Screenshot 2026.07.11 - 10.00.00.00');
    expect(visor.querySelector('video')).toBeNull();
    expect(visor.querySelector('img.lib-player-video')?.getAttribute('src')).toBe(
      'gameclip-media://clip/7',
    );
    // Sin editor para una captura, tampoco en el panel.
    expect(within(visor).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
  });

  it('Intro con una captura abierta no abre el editor', async () => {
    const user = userEvent.setup();
    mock().library.list.mockResolvedValue([captura()]);
    render(<Biblioteca />);
    await user.click(await screen.findByRole('button', { name: /^Ver Terraria/ }));

    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(window.location.hash).toBe('');
  });
});

describe('Biblioteca — regresiones menores', () => {
  it('renombrar no pierde lo escrito cuando la biblioteca se recarga por otro motivo', async () => {
    let avisarCambio: () => void = () => undefined;
    mock().library.onChanged.mockImplementation((listener: () => void) => {
      avisarCambio = listener;
      return () => undefined;
    });
    // Cada recarga devuelve objetos nuevos (como el IPC real): tags es otro array con el mismo contenido.
    mock().library.list.mockImplementation(() =>
      Promise.resolve([crearClip({ id: 5, title: 'Original', tags: ['a'] })]),
    );
    const user = userEvent.setup();
    render(<Biblioteca />);
    await user.click(await screen.findByRole('button', { name: 'Renombrar y etiquetar' }));
    const input = screen.getByLabelText('Título');
    await user.clear(input);
    await user.type(input, 'Nuevo título');

    await act(async () => avisarCambio()); // p. ej. el thumbnailer de otro clip, o un replay guardado
    await waitFor(() => expect(mock().library.list.mock.calls.length).toBeGreaterThan(1));

    expect(screen.getByLabelText('Título')).toHaveValue('Nuevo título');
  });
});

describe('Biblioteca — grupos por fecha', () => {
  it('cabeceras «Hoy» y por mes con el número de clips, en el orden de la lista', async () => {
    const ahora = new Date();
    const haceUnAnio = new Date(ahora.getFullYear() - 1, 2, 15, 12); // marzo del año pasado
    mock().library.list.mockResolvedValue([
      crearClip({ title: 'Reciente', createdAt: ahora.toISOString() }),
      crearClip({ title: 'Viejo 1', createdAt: haceUnAnio.toISOString() }),
      crearClip({ title: 'Viejo 2', createdAt: haceUnAnio.toISOString() }),
    ]);
    render(<Biblioteca />);

    const hoy = await screen.findByRole('region', { name: 'Hoy' });
    expect(within(hoy).getByText('1 clip')).toBeInTheDocument();
    expect(within(hoy).getByText('Reciente')).toBeInTheDocument();
    const marzo = screen.getByRole('region', { name: `Marzo ${ahora.getFullYear() - 1}` });
    expect(within(marzo).getByText('2 clips')).toBeInTheDocument();
    // Orden de hoy: el grupo reciente va primero.
    expect(hoy.compareDocumentPosition(marzo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('Biblioteca — filtro de juego', () => {
  // El catálogo conoce los juegos de STATS: si no, cargar() soltaría el filtro al elegir uno.
  beforeEach(() => {
    mock().library.games.mockResolvedValue(STATS.games.map((g) => g.name));
  });

  it('lista Todos, Escritorio y los juegos con sus contadores, en el orden de gameStats', async () => {
    const user = userEvent.setup();
    mock().library.gameStats.mockResolvedValue(STATS);
    render(<Biblioteca />);

    const lista = await abrirFiltro(user);
    await waitFor(() => expect(within(lista).getAllByRole('option')).toHaveLength(5));
    const opciones = within(lista).getAllByRole('option');
    expect(opciones.map((o) => o.textContent)).toEqual([
      'Todos los juegos48',
      'Escritorio5',
      'Valorant14',
      'CS29',
      'Pokémon Escarlata2',
    ]);
    expect(within(lista).getByRole('option', { name: /^Todos los juegos/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Juegos capturados')).toBeInTheDocument();
    // Iconos: «Todos» el fijo de cuadrícula, Escritorio el monitor.
    expect(opciones[0].querySelector('[data-icon="all"]')).toBeInTheDocument();
    expect(opciones[1].querySelector('[data-icon="desktop"]')).toBeInTheDocument();
  });

  it('elegir un juego consulta por él y marca el botón (con su nombre)', async () => {
    const user = userEvent.setup();
    mock().library.gameStats.mockResolvedValue(STATS);
    render(<Biblioteca />);

    await elegirJuego(user, /^Valorant/);

    await waitFor(() => {
      expect(mock().library.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ game: 'Valorant', withoutGame: false }),
      );
    });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(botonFiltro()).toHaveAccessibleName('Filtrar por juego: Valorant');
    expect(botonFiltro()).toHaveClass('on');
  });

  it('«Escritorio» pide los clips sin juego, no un juego llamado así', async () => {
    const user = userEvent.setup();
    mock().library.gameStats.mockResolvedValue(STATS);
    render(<Biblioteca />);

    await elegirJuego(user, /^Escritorio/);

    await waitFor(() => {
      expect(mock().library.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ withoutGame: true, game: undefined }),
      );
    });
  });

  it('el buscador filtra la lista (sin mayúsculas ni tildes)', async () => {
    const user = userEvent.setup();
    mock().library.gameStats.mockResolvedValue(STATS);
    render(<Biblioteca />);
    const lista = await abrirFiltro(user);
    await waitFor(() => expect(within(lista).getAllByRole('option')).toHaveLength(5));

    await user.type(screen.getByRole('combobox', { name: 'Buscar juego' }), 'pokemon');

    const opciones = within(lista).getAllByRole('option');
    expect(opciones).toHaveLength(1);
    expect(opciones[0]).toHaveTextContent('Pokémon Escarlata');
  });

  it('teclado: escribir, ↑ ↓ e Intro eligen; Esc cierra y devuelve el foco al botón', async () => {
    const user = userEvent.setup();
    mock().library.gameStats.mockResolvedValue(STATS);
    render(<Biblioteca />);
    const lista = await abrirFiltro(user);
    await waitFor(() => expect(within(lista).getAllByRole('option')).toHaveLength(5));
    const buscador = screen.getByRole('combobox', { name: 'Buscar juego' });
    expect(buscador).toHaveFocus();

    // Desde «Todos» (el elegido), dos abajo: Valorant.
    await user.keyboard('{ArrowDown}{ArrowDown}');
    const activa = document.getElementById(buscador.getAttribute('aria-activedescendant') ?? '');
    expect(activa).toHaveTextContent('Valorant');
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(mock().library.list).toHaveBeenLastCalledWith(expect.objectContaining({ game: 'Valorant' })),
    );
    expect(botonFiltro()).toHaveFocus();

    // Escribir filtra e Intro elige la primera coincidencia.
    await user.click(botonFiltro());
    await user.keyboard('cs{Enter}');
    await waitFor(() =>
      expect(mock().library.list).toHaveBeenLastCalledWith(expect.objectContaining({ game: 'CS2' })),
    );

    // Esc cierra sin cambiar nada.
    await user.click(botonFiltro());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(botonFiltro()).toHaveFocus();
    expect(botonFiltro()).toHaveAccessibleName('Filtrar por juego: CS2');
  });

  it('clic fuera cierra el desplegable', async () => {
    const user = userEvent.setup();
    render(<Biblioteca />);
    await abrirFiltro(user);

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('contador junto a la barra: «N clips» sin filtros y «N de M» con filtros', async () => {
    const user = userEvent.setup();
    mock().library.gameStats.mockResolvedValue(STATS);
    mock().library.list.mockResolvedValue([crearClip(), crearClip()]);
    render(<Biblioteca />);

    expect(await screen.findByText('2 clips', { selector: '.library-count' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '★ Favoritos' }));
    expect(await screen.findByText('2 de 48')).toBeInTheDocument();
  });

  it('los contadores se refrescan cuando cambia el catálogo', async () => {
    let alCambiar: () => void = () => undefined;
    mock().library.onChanged.mockImplementation((cb: () => void) => {
      alCambiar = cb;
      return () => undefined;
    });
    render(<Biblioteca />);
    await waitFor(() => expect(mock().library.gameStats).toHaveBeenCalledTimes(1));

    await act(async () => alCambiar());

    await waitFor(() => expect(mock().library.gameStats).toHaveBeenCalledTimes(2));
  });
});

describe('Biblioteca — panel reproductor', () => {
  function tresClips() {
    return [
      crearClip({ id: 21, title: 'Primero' }),
      crearClip({ id: 22, title: 'Segundo', favorite: true }),
      crearClip({ id: 23, title: 'Tercero' }),
    ];
  }

  async function abrirPrimero(user: Usuario) {
    await user.click(await screen.findByRole('button', { name: 'Reproducir Primero' }));
    return panel('Primero');
  }

  it('clic en la tarjeta abre el panel con el vídeo y las filas; «×» vuelve a la cuadrícula', async () => {
    const user = userEvent.setup();
    mock().library.list.mockResolvedValue(tresClips());
    render(<Biblioteca />);

    const visor = await abrirPrimero(user);
    const video = visor.querySelector('video') as HTMLVideoElement;
    expect(video.getAttribute('src')).toBe('gameclip-media://clip/21');
    expect(video.controls).toBe(true);
    expect(video.autoplay).toBe(true);
    // La cuadrícula da paso a las filas; la del clip abierto, marcada.
    // La cuadrícula queda montada pero oculta (no se re-montan las tarjetas al cerrar).
    expect(document.querySelector('.library-body:not(.split)')).toHaveAttribute('hidden');
    expect(screen.queryByRole('button', { name: 'Reproducir Segundo' })).not.toBeInTheDocument();
    const filas = document.querySelectorAll('.lib-row');
    expect(filas).toHaveLength(3);
    expect(filas[0]).toHaveAttribute('aria-current', 'true');
    expect(within(visor).getByRole('heading', { name: 'Primero' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('region', { name: 'Primero' })).not.toBeInTheDocument();
    expect(document.querySelectorAll('.clip-card')).toHaveLength(3);
  });

  it('Esc cierra el panel', async () => {
    const user = userEvent.setup();
    mock().library.list.mockResolvedValue(tresClips());
    render(<Biblioteca />);
    await abrirPrimero(user);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('region', { name: 'Primero' })).not.toBeInTheDocument();
  });

  it('↑ ↓ cambian de clip y el <video> anterior se desmonta', async () => {
    const user = userEvent.setup();
    mock().library.list.mockResolvedValue(tresClips());
    render(<Biblioteca />);
    const visor = await abrirPrimero(user);
    const videoAnterior = visor.querySelector('video') as HTMLVideoElement;

    fireEvent.keyDown(document.body, { key: 'ArrowDown' });

    const segundo = panel('Segundo');
    expect(segundo.querySelector('video')?.getAttribute('src')).toBe('gameclip-media://clip/22');
    expect(videoAnterior.isConnected).toBe(false);
    expect(document.querySelectorAll('video')).toHaveLength(1);

    fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    expect(panel('Primero')).toBeInTheDocument();
    // En el borde no se sale de la lista.
    fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    expect(panel('Primero')).toBeInTheDocument();
  });

  it('clic en una fila cambia el clip', async () => {
    const user = userEvent.setup();
    mock().library.list.mockResolvedValue(tresClips());
    render(<Biblioteca />);
    await abrirPrimero(user);

    await user.click(document.querySelectorAll<HTMLElement>('.lib-row')[2]);

    expect(panel('Tercero')).toBeInTheDocument();
    expect(document.querySelectorAll('.lib-row')[2]).toHaveAttribute('aria-current', 'true');
  });

  it('Intro abre el editor del clip abierto', async () => {
    const user = userEvent.setup();
    mock().library.list.mockResolvedValue(tresClips());
    render(<Biblioteca />);
    await abrirPrimero(user);
    fireEvent.keyDown(document.body, { key: 'ArrowDown' });

    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(window.location.hash).toBe('#/editor/22');
  });

  it('las teclas no actúan mientras se escribe en un campo', async () => {
    const user = userEvent.setup();
    mock().library.list.mockResolvedValue(tresClips());
    render(<Biblioteca />);
    await abrirPrimero(user);
    const busqueda = screen.getByLabelText('Buscar clips');

    fireEvent.keyDown(busqueda, { key: 'ArrowDown' });
    fireEvent.keyDown(busqueda, { key: 'Enter' });
    fireEvent.keyDown(busqueda, { key: 'Escape' });

    expect(panel('Primero')).toBeInTheDocument();
    expect(window.location.hash).toBe('');
  });

  it('el panel ofrece las mismas acciones que la tarjeta', async () => {
    const user = userEvent.setup();
    mock().library.list.mockResolvedValue(tresClips());
    render(<Biblioteca />);
    const visor = await abrirPrimero(user);

    for (const nombre of [
      'Editar',
      'Marcar favorito',
      'Renombrar y etiquetar',
      'Abrir carpeta',
      'Eliminar',
    ]) {
      expect(within(visor).getByRole('button', { name: nombre })).toBeInTheDocument();
    }
    await user.click(within(visor).getByRole('button', { name: 'Marcar favorito' }));
    expect(mock().library.update).toHaveBeenCalledWith(21, { favorite: true });
    await user.click(within(visor).getByRole('button', { name: 'Abrir carpeta' }));
    expect(mock().library.openFolder).toHaveBeenCalledWith(21);
    await user.click(within(visor).getByRole('button', { name: 'Renombrar y etiquetar' }));
    expect(within(visor).getByLabelText('Título')).toHaveValue('Primero');
    await user.click(within(visor).getByRole('button', { name: 'Editar' }));
    expect(window.location.hash).toBe('#/editor/21');
  });

  it('con el panel abierto, pasar el cursor por las filas no reproduce nada', async () => {
    const user = userEvent.setup();
    matchMediaFalso(false);
    mock().library.list.mockResolvedValue(tresClips());
    render(<Biblioteca />);
    await abrirPrimero(user);

    await user.hover(document.querySelectorAll<HTMLElement>('.lib-row')[1]);
    await new Promise((r) => setTimeout(r, 300));

    expect(document.querySelectorAll('video')).toHaveLength(1); // solo el del panel
  });

  it('si el clip abierto desaparece del listado, el panel se cierra', async () => {
    const user = userEvent.setup();
    let alCambiar: () => void = () => undefined;
    mock().library.onChanged.mockImplementation((cb: () => void) => {
      alCambiar = cb;
      return () => undefined;
    });
    mock().library.list.mockResolvedValue(tresClips());
    render(<Biblioteca />);
    await abrirPrimero(user);

    mock().library.list.mockResolvedValue(tresClips().slice(1));
    await act(async () => alCambiar());

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Primero' })).not.toBeInTheDocument(),
    );
    expect(document.querySelectorAll('.clip-card')).toHaveLength(2);
  });
});

describe('Biblioteca — modal de eliminar', () => {
  it('muestra miniatura, título, juego y duración; el foco empieza en Cancelar', async () => {
    const user = userEvent.setup();
    mock().library.list.mockResolvedValue([
      crearClip({ id: 9, title: 'Triple en la final', game: 'Rocket League', durationSeconds: 48 }),
    ]);
    render(<Biblioteca />);

    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));

    const dialogo = screen.getByRole('alertdialog', { name: '¿Eliminar el clip?' });
    expect(within(dialogo).getByText('Triple en la final')).toBeInTheDocument();
    expect(within(dialogo).getByText('Rocket League')).toBeInTheDocument();
    expect(within(dialogo).getByText('0:48')).toBeInTheDocument();
    expect(dialogo.querySelector('img')?.getAttribute('src')).toContain('gameclip-media://thumb/9');
    expect(
      within(dialogo).getByText('El archivo de vídeo también se borra del disco.'),
    ).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  it('para una captura habla de la imagen', async () => {
    const user = userEvent.setup();
    mock().library.list.mockResolvedValue([crearClip({ title: 'Foto', kind: 'image' })]);
    render(<Biblioteca />);

    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));

    expect(screen.getByText('La imagen también se borra del disco.')).toBeInTheDocument();
  });

  it('Esc cancela sin borrar', async () => {
    const user = userEvent.setup();
    mock().library.list.mockResolvedValue([crearClip()]);
    render(<Biblioteca />);
    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mock().library.remove).not.toHaveBeenCalled();
  });

  it('mientras se borra, el diálogo queda ocupado', async () => {
    const user = userEvent.setup();
    let terminar: () => void = () => undefined;
    mock().library.remove.mockImplementation(
      () => new Promise<void>((resolve) => (terminar = resolve)),
    );
    mock().library.list.mockResolvedValue([crearClip()]);
    render(<Biblioteca />);
    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = screen.getByRole('alertdialog');

    await user.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    expect(within(dialogo).getByRole('button', { name: 'Eliminar' })).toBeDisabled();
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    await act(async () => terminar());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('si falla, muestra el modal de error con el mensaje y «Entendido» lo cierra', async () => {
    const user = userEvent.setup();
    mock().library.remove.mockRejectedValue(new Error('El archivo del clip está en uso.'));
    mock().library.list.mockResolvedValue([crearClip({ title: 'Bloqueado' })]);
    render(<Biblioteca />);
    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }),
    );

    const error = await screen.findByRole('alertdialog', { name: 'No se pudo eliminar' });
    expect(within(error).getByText('El archivo del clip está en uso.')).toBeInTheDocument();
    expect(within(error).getByText('Bloqueado')).toBeInTheDocument();
    expect(within(error).getByRole('button', { name: 'Entendido' })).toHaveFocus();

    await user.click(within(error).getByRole('button', { name: 'Entendido' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('un fallo sin mensaje muestra el texto de siempre', async () => {
    const user = userEvent.setup();
    mock().library.remove.mockRejectedValue('raro');
    mock().library.list.mockResolvedValue([crearClip()]);
    render(<Biblioteca />);
    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }),
    );

    expect(await screen.findByText('No se pudo borrar el clip.')).toBeInTheDocument();
  });

  it('borrar desde la tarjeta suelta la preview ANTES de pedir el borrado', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    matchMediaFalso(false);
    let previewViva: boolean | null = null;
    mock().library.remove.mockImplementation(() => {
      previewViva = screen.queryByTestId('preview-3') !== null;
      return Promise.resolve();
    });
    mock().library.list.mockResolvedValue([crearClip({ id: 3, title: 'Con preview' })]);
    render(<Biblioteca />);
    const card = (await screen.findByText('Con preview')).closest('.clip-card') as HTMLElement;
    fireEvent.mouseEnter(card);
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByTestId('preview-3')).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: 'Eliminar' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }),
    );

    await waitFor(() => expect(mock().library.remove).toHaveBeenCalledWith(3));
    expect(previewViva).toBe(false);
    vi.useRealTimers();
  });

  it('borrar desde el panel cierra el reproductor (suelta el archivo) antes de pedir el borrado', async () => {
    const user = userEvent.setup();
    let videoVivo: boolean | null = null;
    mock().library.remove.mockImplementation(() => {
      videoVivo = document.querySelector('[data-testid="player-video"]') !== null;
      return Promise.resolve();
    });
    mock().library.list.mockResolvedValue([crearClip({ id: 30, title: 'Abierto' })]);
    render(<Biblioteca />);
    await user.click(await screen.findByRole('button', { name: 'Reproducir Abierto' }));

    await user.click(within(panel('Abierto')).getByRole('button', { name: 'Eliminar' }));
    // Esc con el modal abierto cancela el modal, no cierra además el panel.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(panel('Abierto')).toBeInTheDocument();

    await user.click(within(panel('Abierto')).getByRole('button', { name: 'Eliminar' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }),
    );

    expect(mock().library.remove).toHaveBeenCalledWith(30);
    expect(videoVivo).toBe(false);
  });
});

describe('Biblioteca — revisión: panel, contadores, día y teclado', () => {
  function tresClips() {
    return [
      crearClip({ id: 41, title: 'Uno' }),
      crearClip({ id: 42, title: 'Dos' }),
      crearClip({ id: 43, title: 'Tres' }),
    ];
  }

  it('cerrar el panel vuelve al mismo scroll y con el foco en la tarjeta del clip abierto', async () => {
    const user = userEvent.setup();
    mock().library.list.mockResolvedValue(tresClips());
    render(<Biblioteca />);
    await screen.findByText('Dos');
    const rejilla = document.querySelector('.library-body') as HTMLElement;
    const tarjetaAntes = rejilla.querySelector('[data-clip-id="43"]');
    // jsdom no hace scroll: un scrollTop con memoria, que se pierde mientras está oculta (como
    // puede pasar con display: none en Chromium).
    let scroll = 0;
    Object.defineProperty(rejilla, 'scrollTop', {
      configurable: true,
      get: () => (rejilla.hidden ? 0 : scroll),
      set: (v: number) => {
        scroll = v;
      },
    });
    scroll = 640;

    await user.click(screen.getByRole('button', { name: 'Reproducir Dos' }));
    scroll = 0; // oculta: el navegador la deja arriba
    fireEvent.keyDown(document.body, { key: 'ArrowDown' }); // cambia a «Tres» desde las filas
    expect(panel('Tres')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(scroll).toBe(640);
    const thumb = screen.getByRole('button', { name: 'Reproducir Tres' });
    expect(thumb).toHaveFocus();
    // Las mismas tarjetas: no se re-montaron.
    expect(rejilla.querySelector('[data-clip-id="43"]')).toBe(tarjetaAntes);
  });

  it('con «×» el foco también vuelve a la tarjeta', async () => {
    const user = userEvent.setup();
    mock().library.list.mockResolvedValue(tresClips());
    render(<Biblioteca />);
    await user.click(await screen.findByRole('button', { name: 'Reproducir Uno' }));

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(screen.getByRole('button', { name: 'Reproducir Uno' })).toHaveFocus();
  });

  it('con el panel abierto no arranca ninguna vista previa en la cuadrícula oculta', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    matchMediaFalso(false);
    mock().library.list.mockResolvedValue([crearClip({ id: 3, title: 'Con preview' })]);
    render(<Biblioteca />);
    const card = (await screen.findByText('Con preview')).closest('.clip-card') as HTMLElement;

    // El cursor entra (arranque pendiente) y el clic abre el panel antes del retardo.
    fireEvent.mouseEnter(card);
    fireEvent.click(within(card).getByRole('button', { name: 'Reproducir Con preview' }));
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByTestId('preview-3')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('si gameStats falla, el contador con filtros no se queda en «de …»', async () => {
    const user = userEvent.setup();
    mock().library.gameStats.mockRejectedValue(new Error('caído'));
    mock().library.list.mockResolvedValue([crearClip(), crearClip(), crearClip()]);
    render(<Biblioteca />);
    await screen.findByText('3 clips', { selector: '.library-count' });

    await user.click(screen.getByRole('button', { name: '★ Favoritos' }));

    await waitFor(() =>
      expect(mock().library.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ favoritesOnly: true }),
      ),
    );
    expect(document.querySelector('.library-count')?.textContent).toBe('3 clips');
  });

  it('una respuesta vieja de gameStats no pisa una más nueva', async () => {
    let alCambiar: () => void = () => undefined;
    mock().library.onChanged.mockImplementation((cb: () => void) => {
      alCambiar = cb;
      return () => undefined;
    });
    let resolverVieja: (v: unknown) => void = () => undefined;
    mock().library.gameStats
      .mockImplementationOnce(() => new Promise((r) => (resolverVieja = r)))
      .mockResolvedValueOnce({ ...STATS, total: 50 });
    mock().library.games.mockResolvedValue(STATS.games.map((g) => g.name));
    mock().library.list.mockResolvedValue([crearClip()]);
    const user = userEvent.setup();
    render(<Biblioteca />);
    await screen.findByText('1 clip', { selector: '.library-count' });

    await act(async () => alCambiar());
    await waitFor(() => expect(mock().library.gameStats).toHaveBeenCalledTimes(2));
    await act(async () => resolverVieja({ ...STATS, total: 7 }));
    await user.click(screen.getByRole('button', { name: '★ Favoritos' }));

    expect(await screen.findByText('1 de 50')).toBeInTheDocument();
  });

  it('una ráfaga de cambios del catálogo pide los contadores una sola vez', async () => {
    let alCambiar: () => void = () => undefined;
    mock().library.onChanged.mockImplementation((cb: () => void) => {
      alCambiar = cb;
      return () => undefined;
    });
    render(<Biblioteca />);
    await waitFor(() => expect(mock().library.gameStats).toHaveBeenCalledTimes(1));

    await act(async () => {
      for (let i = 0; i < 5; i++) alCambiar();
    });

    await waitFor(() => expect(mock().library.gameStats).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 400));
    expect(mock().library.gameStats).toHaveBeenCalledTimes(2);
  });

  it('al pasar la medianoche, «Hoy» pasa a «Ayer» sin recargar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 9, 8, 23, 59, 0));
    mock().library.list.mockResolvedValue([
      crearClip({ title: 'Nocturno', createdAt: new Date(2026, 9, 8, 23, 0).toISOString() }),
    ]);
    render(<Biblioteca />);
    expect(await screen.findByRole('region', { name: 'Hoy' })).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });

    expect(screen.getByRole('region', { name: 'Ayer' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Hoy' })).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('filtro: ↓ sobre el botón cerrado abre el desplegable sin cambiar el clip del panel; Inicio/Fin', async () => {
    const user = userEvent.setup();
    mock().library.gameStats.mockResolvedValue(STATS);
    mock().library.list.mockResolvedValue(tresClips());
    render(<Biblioteca />);
    await waitFor(() => expect(mock().library.gameStats).toHaveBeenCalled());
    await user.click(await screen.findByRole('button', { name: 'Reproducir Uno' }));

    botonFiltro().focus();
    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('listbox', { name: 'Filtrar por juego' })).toBeInTheDocument();
    expect(panel('Uno')).toBeInTheDocument();
    const buscador = screen.getByRole('combobox', { name: 'Buscar juego' });
    const activa = () =>
      document.getElementById(buscador.getAttribute('aria-activedescendant') ?? '');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(5));
    await user.keyboard('{End}');
    expect(activa()).toHaveTextContent('Pokémon Escarlata');
    await user.keyboard('{Home}');
    expect(activa()).toHaveTextContent('Todos los juegos');
    expect(panel('Uno')).toBeInTheDocument();
  });

  it('con un modal ajeno abierto, ↑ ↓ e Intro no actúan sobre el panel', async () => {
    const user = userEvent.setup();
    mock().library.list.mockResolvedValue(tresClips());
    render(<Biblioteca />);
    await user.click(await screen.findByRole('button', { name: 'Reproducir Uno' }));
    const ajeno = document.createElement('div');
    ajeno.setAttribute('role', 'dialog');
    ajeno.setAttribute('aria-modal', 'true');
    document.body.appendChild(ajeno);

    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(panel('Uno')).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    ajeno.remove();
  });

  it('Intro con el foco en un botón de acción del panel no abre el editor', async () => {
    const user = userEvent.setup();
    mock().library.list.mockResolvedValue(tresClips());
    render(<Biblioteca />);
    await user.click(await screen.findByRole('button', { name: 'Reproducir Uno' }));
    const carpeta = within(panel('Uno')).getByRole('button', { name: 'Abrir carpeta' });
    carpeta.focus();

    fireEvent.keyDown(carpeta, { key: 'Enter' });

    expect(window.location.hash).toBe('');
  });
});

describe('Biblioteca — foco devuelto al cerrar el panel', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    matchMediaFalso(false);
  });

  it('cerrar el panel devuelve el foco a la tarjeta SIN arrancar su vista previa', async () => {
    const user = userEvent.setup();
    mock().library.list.mockResolvedValue([crearClip({ id: 51, title: 'Cerrado' })]);
    render(<Biblioteca />);
    await user.click(await screen.findByRole('button', { name: 'Reproducir Cerrado' }));

    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Reproducir Cerrado' })).toHaveFocus();
    await new Promise((r) => setTimeout(r, 300));

    expect(screen.queryByTestId('preview-51')).not.toBeInTheDocument();
    expect(document.querySelector('video')).toBeNull();
  });

  it('el foco de teclado normal (Tab hasta la tarjeta) sí arranca la vista previa', async () => {
    const user = userEvent.setup();
    mock().library.list.mockResolvedValue([crearClip({ id: 52, title: 'Con Tab' })]);
    render(<Biblioteca />);
    const thumb = await screen.findByRole('button', { name: 'Reproducir Con Tab' });

    while (document.activeElement !== thumb) await user.tab();
    await new Promise((r) => setTimeout(r, 300));

    expect(screen.getByTestId('preview-52')).toBeInTheDocument();
  });
});
