import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditorAvanzado from '../views/EditorAvanzado';
import { crearClip } from './helpers';
import { crearGameclipMock } from './setup';

// jsdom no implementa PointerEvent; sin él los eventos de puntero pierden clientX (y el seek por la
// regla no movería el playhead). MouseEvent sí lleva coordenadas.
if (typeof (globalThis as unknown as { PointerEvent?: unknown }).PointerEvent === 'undefined') {
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = MouseEvent;
}

type GameclipMock = ReturnType<typeof crearGameclipMock>;
const mock = () => window.gameclip as unknown as GameclipMock;

const rolTracks = [
  { index: 0, name: 'default' },
  { index: 1, name: 'game' },
  { index: 2, name: 'mic' },
];

beforeEach(() => {
  Object.defineProperty(window, 'gameclip', { writable: true, value: crearGameclipMock() });
  mock().editor.getAudioTracks.mockResolvedValue(rolTracks);
  mock().editor.getWaveforms.mockResolvedValue([
    { key: 'game', peaks: [0.2, 0.8, 0.4] },
    { key: 'mic', peaks: [0.1, 0.3, 0.1] },
  ]);
});

afterEach(() => vi.restoreAllMocks());

function renderEA(ruta = '/editor-avanzado/7') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/editor-avanzado/:clipId" element={<EditorAvanzado />} />
        <Route path="/biblioteca" element={<div>Biblioteca</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function prepararClip() {
  mock().library.get.mockResolvedValue(
    crearClip({ id: 7, title: 'Jugada épica', durationSeconds: 60 }),
  );
  renderEA();
  await screen.findByText(/Jugada épica/);
}

describe('EditorAvanzado — carga', () => {
  it('muestra el clip, el timeline y una pista por fuente con su volumen al 100 %', async () => {
    await prepararClip();

    expect(screen.getByLabelText('Posición de reproducción')).toBeInTheDocument();
    expect(screen.getByLabelText('Volumen de game')).toHaveValue('100');
    expect(screen.getByLabelText('Volumen de mic')).toHaveValue('100');
  });

  it('clip inexistente ofrece volver a la biblioteca', async () => {
    mock().library.get.mockResolvedValue(null);
    renderEA('/editor-avanzado/99');
    expect(await screen.findByText(/ya no está disponible/)).toBeInTheDocument();
  });
});

describe('EditorAvanzado — volumen y eliminar', () => {
  it('el slider ajusta el volumen de la pista y muestra el %', async () => {
    await prepararClip();
    const slider = screen.getByLabelText('Volumen de game');
    fireEvent.change(slider, { target: { value: '150' } });
    expect(slider).toHaveValue('150');
    expect(screen.getByText('150%')).toBeInTheDocument();
  });

  it('eliminar una pista la marca como fuera del render y permite restaurarla', async () => {
    await prepararClip();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar mic' }));
    expect(screen.getByText(/no entra en el render/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Volumen de mic')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Restaurar mic' }));
    expect(screen.getByLabelText('Volumen de mic')).toBeInTheDocument();
  });
});

describe('EditorAvanzado — render', () => {
  it('renderiza a MP4 con los volúmenes por pista (mic eliminada = 0) sin tocar el original', async () => {
    await prepararClip();

    fireEvent.change(screen.getByLabelText('Volumen de game'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar mic' }));

    // Abrir el modal de render (botón de la barra superior) y confirmar (botón del modal).
    fireEvent.click(screen.getByRole('button', { name: 'Renderizar vídeo' }));
    const botones = screen.getAllByRole('button', { name: 'Renderizar vídeo' });
    fireEvent.click(botones[botones.length - 1]);

    await waitFor(() => expect(mock().exporter.run).toHaveBeenCalled());
    expect(mock().exporter.run).toHaveBeenCalledWith(
      expect.objectContaining({
        clipId: 7,
        format: 'mp4',
        quality: 'media',
        startSeconds: 0,
        endSeconds: 60,
        trackVolumes: { game: 1.5, mic: 0 },
      }),
    );
    // El editor no borra ni reescribe el clip original.
    expect(mock().library.remove).not.toHaveBeenCalled();
  });

  it('salir vuelve a la biblioteca', async () => {
    await prepararClip();
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect(await screen.findByText('Biblioteca')).toBeInTheDocument();
  });
});

describe('EditorAvanzado — reproducción', () => {
  it('play alterna a Pausar; sin AudioContext (jsdom) no pide audio por pista', async () => {
    await prepararClip();
    fireEvent.click(screen.getByRole('button', { name: 'Reproducir' }));
    // togglePlay es async (carga perezosa del audio); el botón pasa a Pausar sin romperse.
    await screen.findByRole('button', { name: 'Pausar' });
    // El motor es no-op sin Web Audio: no se extrae audio del main.
    expect(mock().editor.getTrackAudio).not.toHaveBeenCalled();
  });
});

describe('EditorAvanzado — cortes múltiples (Fase 3)', () => {
  // Sin layout real (jsdom), el timeline cae a 24 px/s: clientX 240 → 10 s, 720 → 30 s.
  function seekRuler(clientX: number) {
    fireEvent.pointerDown(screen.getByLabelText('Posición de reproducción'), { clientX });
  }

  it('dividir crea segmentos y deshacer/rehacer los revierte y reaplica', async () => {
    await prepararClip(); // duración 60 s
    seekRuler(240); // playhead a 10 s
    fireEvent.click(screen.getByRole('button', { name: 'Dividir' }));
    expect(screen.getByText(/2 segmentos/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(screen.queryByText(/segmentos/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rehacer' }));
    expect(screen.getByText(/2 segmentos/)).toBeInTheDocument();
  });

  it('borrar un segmento del medio y renderizar manda esos segmentos (con un hueco)', async () => {
    await prepararClip();
    seekRuler(240); // 10 s
    fireEvent.click(screen.getByRole('button', { name: 'Dividir' }));
    seekRuler(720); // 30 s
    fireEvent.click(screen.getByRole('button', { name: 'Dividir' }));
    // Tres segmentos: [0,10] [10,30] [30,60]. Borra el del medio.
    fireEvent.click(screen.getByRole('button', { name: 'Segmento 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Borrar segmento' }));

    fireEvent.click(screen.getByRole('button', { name: 'Renderizar vídeo' }));
    const botones = screen.getAllByRole('button', { name: 'Renderizar vídeo' });
    fireEvent.click(botones[botones.length - 1]);

    await waitFor(() => expect(mock().exporter.run).toHaveBeenCalled());
    expect(mock().exporter.run).toHaveBeenCalledWith(
      expect.objectContaining({
        clipId: 7,
        startSeconds: 0,
        endSeconds: 60,
        segments: [
          { start: 0, end: 10 },
          { start: 30, end: 60 },
        ],
      }),
    );
  });

  it('sin cortes (un solo segmento) el render no manda segments', async () => {
    await prepararClip();
    fireEvent.click(screen.getByRole('button', { name: 'Renderizar vídeo' }));
    const botones = screen.getAllByRole('button', { name: 'Renderizar vídeo' });
    fireEvent.click(botones[botones.length - 1]);
    await waitFor(() => expect(mock().exporter.run).toHaveBeenCalled());
    expect(mock().exporter.run.mock.calls[0][0]).not.toHaveProperty('segments');
  });
});

describe('EditorAvanzado — reencuadre (Fase 4)', () => {
  // jsdom no calcula videoWidth/Height; se inyectan y se dispara loadedMetadata para fijar la fuente.
  function setVideoDims(w: number, h: number) {
    const video = document.querySelector('video.eav-video') as HTMLVideoElement;
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: w });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: h });
    fireEvent.loadedMetadata(video);
  }

  it('elegir un aspecto activa los controles de encaje (recorte/barras)', async () => {
    await prepararClip();
    // Con "original" no hay toggle de encaje.
    expect(screen.queryByRole('button', { name: 'Barras' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '9:16' }));
    expect(screen.getByRole('button', { name: 'Recorte' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Barras' })).toBeInTheDocument();
    // En modo recorte aparece el control de zoom.
    expect(screen.getByLabelText('Zoom')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Barras' }));
    // En barras no hay zoom.
    expect(screen.queryByLabelText('Zoom')).not.toBeInTheDocument();
  });

  it('el render manda el reframe elegido y las dimensiones de la fuente', async () => {
    await prepararClip();
    setVideoDims(2560, 1440);
    fireEvent.click(screen.getByRole('button', { name: '9:16' }));

    fireEvent.click(screen.getByRole('button', { name: 'Renderizar vídeo' }));
    const botones = screen.getAllByRole('button', { name: 'Renderizar vídeo' });
    fireEvent.click(botones[botones.length - 1]);

    await waitFor(() => expect(mock().exporter.run).toHaveBeenCalled());
    expect(mock().exporter.run).toHaveBeenCalledWith(
      expect.objectContaining({
        reframe: { aspect: '9:16', mode: 'cover', zoom: 1, offset: { x: 0, y: 0 } },
        sourceWidth: 2560,
        sourceHeight: 1440,
      }),
    );
  });

  it('sin reencuadre (original) el render no manda reframe', async () => {
    await prepararClip();
    setVideoDims(2560, 1440);
    fireEvent.click(screen.getByRole('button', { name: 'Renderizar vídeo' }));
    const botones = screen.getAllByRole('button', { name: 'Renderizar vídeo' });
    fireEvent.click(botones[botones.length - 1]);
    await waitFor(() => expect(mock().exporter.run).toHaveBeenCalled());
    expect(mock().exporter.run.mock.calls[0][0]).not.toHaveProperty('reframe');
  });
});

describe('EditorAvanzado — ediciones sin terminar (drafts, Fase 5)', () => {
  const DRAFT_KEY = 'gameclip.editor.draft.7';

  it('editar auto-guarda la edición sin terminar', async () => {
    await prepararClip();
    fireEvent.change(screen.getByLabelText('Volumen de game'), { target: { value: '150' } });
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull());
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY)!);
    expect(draft.clipId).toBe(7);
    expect(draft.volumes.game).toBe(1.5);
  });

  it('al abrir un clip con una edición guardada, se restaura', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        clipId: 7,
        updatedAt: 1,
        segments: [{ start: 0, end: 60 }],
        volumes: { game: 0.5 },
        removed: [],
        reframe: { aspect: 'original', mode: 'cover', zoom: 1, offset: { x: 0, y: 0 } },
      }),
    );
    await prepararClip();
    expect(screen.getByLabelText('Volumen de game')).toHaveValue('50');
  });

  it('Restablecer descarta los cambios y borra la edición guardada', async () => {
    await prepararClip();
    fireEvent.change(screen.getByLabelText('Volumen de game'), { target: { value: '150' } });
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Restablecer' }));
    expect(screen.getByLabelText('Volumen de game')).toHaveValue('100');
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).toBeNull());
  });
});

describe('EditorAvanzado — capturar fotograma (Fase 5)', () => {
  function setVideoDims(w: number, h: number) {
    const video = document.querySelector('video.eav-video') as HTMLVideoElement;
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: w });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: h });
    fireEvent.loadedMetadata(video);
  }

  it('el botón 📷 guarda el fotograma actual vía captureFrame', async () => {
    // jsdom no implementa canvas: se stubea un contexto que hace no-op en cualquier método (sirve
    // tanto para la captura como para el <canvas> de las ondas) y un toDataURL fijo.
    const noop = () => undefined;
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (t, p) => (p in t ? t[p as string] : noop),
      set: (t, p, v) => {
        t[p as string] = v;
        return true;
      },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D); // prettier-ignore
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,ZZZ');

    await prepararClip();
    setVideoDims(2560, 1440);
    fireEvent.click(screen.getByRole('button', { name: 'Capturar fotograma' }));

    await waitFor(() =>
      expect(mock().editor.captureFrame).toHaveBeenCalledWith(7, 'data:image/png;base64,ZZZ'),
    );
    expect(await screen.findByText(/Fotograma guardado/)).toBeInTheDocument();
  });

  it('📷 funciona aunque no llegue loadedMetadata (dimensiones vía loadedData)', async () => {
    // Regresión F5-fix-1: llegando al editor desde el visor simple, la metadata del <video> ya estaba
    // cargada y el evento `loadedmetadata` se pierde. Antes, `sourceDims` quedaba nulo y el botón 📷
    // quedaba deshabilitado (clic muerto, sin mensaje). Debe bastar con `loadeddata`.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      new Proxy({} as Record<string, unknown>, { get: () => () => undefined }) as unknown as CanvasRenderingContext2D, // prettier-ignore
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,ZZZ');

    await prepararClip();
    const video = document.querySelector('video.eav-video') as HTMLVideoElement;
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 });
    fireEvent.loadedData(video); // NO loadedMetadata

    fireEvent.click(screen.getByRole('button', { name: 'Capturar fotograma' }));
    await waitFor(() => expect(mock().editor.captureFrame).toHaveBeenCalledWith(7, 'data:image/png;base64,ZZZ')); // prettier-ignore
  });
});

describe('EditorAvanzado — alto del panel persistente', () => {
  it('arrastrar el divisor guarda el alto y al reabrir el editor arranca con ese alto', async () => {
    await prepararClip();
    const divisor = screen.getByRole('separator', { name: /Redimensionar el panel/ });

    // Arrastrar hacia arriba (clientY menor) agranda el panel: 300 + (500-400) = 400.
    fireEvent.pointerDown(divisor, { clientY: 500 });
    fireEvent.pointerMove(window, { clientY: 400 });
    fireEvent.pointerUp(window, { clientY: 400 });

    expect(localStorage.getItem('gameclip.editor.panelHeight')).toBe('400');

    // Reabrir el editor (otro montaje): el panel arranca con el alto guardado.
    renderEA();
    await screen.findAllByText(/Jugada épica/);
    const paneles = document.querySelectorAll('.eav-bottom');
    expect((paneles[paneles.length - 1] as HTMLElement).style.height).toBe('400px');
  });
});

describe('EditorAvanzado — zoom', () => {
  it('el zoom parte de 1× (alejar deshabilitado) y acercar lo habilita', async () => {
    await prepararClip();
    const alejar = screen.getByRole('button', { name: 'Alejar' });
    const acercar = screen.getByRole('button', { name: 'Acercar' });

    expect(alejar).toBeDisabled(); // en 1× (fit) no se puede alejar más
    fireEvent.click(acercar);
    expect(alejar).toBeEnabled(); // tras acercar, ya se puede alejar
  });
});
