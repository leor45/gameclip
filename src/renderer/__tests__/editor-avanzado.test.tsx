import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('regresión: si el IPC de render rechaza, el modal muestra el error y vuelve a ofrecer renderizar', async () => {
    await prepararClip();
    mock().exporter.run.mockRejectedValue(new Error('El recorte debe durar al menos 0.5 s.'));

    fireEvent.click(screen.getByRole('button', { name: 'Renderizar vídeo' }));
    const botones = screen.getAllByRole('button', { name: 'Renderizar vídeo' });
    fireEvent.click(botones[botones.length - 1]);

    // Antes: `rendering` quedaba en true para siempre (barra al 0 % y un Cancelar que no cancela nada).
    expect(await screen.findByText('El recorte debe durar al menos 0.5 s.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Progreso del render')).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Renderizar vídeo' }).length,
    ).toBeGreaterThanOrEqual(2);
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

/**
 * AudioContext mínimo para que el motor de audio en vivo se active en jsdom. Registra el offset de
 * cada fuente que arranca: es lo que de verdad sonaría.
 */
class FakeAudioContext {
  static ultima: FakeAudioContext | null = null;
  state = 'running';
  currentTime = 0;
  readonly destination = {};
  readonly inicios: number[] = [];
  /** Un nodo de ganancia por pista (en el orden de creación); `ganancia()` da la que sonaría. */
  readonly ganancias: Array<{ gain: { value: number; ultima: number | null } }> = [];
  readonly decodeAudioData = vi.fn(() => Promise.resolve({ duration: 60 }));
  constructor() {
    FakeAudioContext.ultima = this;
  }
  createGain() {
    const nodo = {
      gain: {
        value: 1,
        ultima: null as number | null,
        setTargetAtTime: (objetivo: number) => {
          nodo.gain.ultima = objetivo;
        },
      },
      connect: () => undefined,
    };
    this.ganancias.push(nodo);
    return nodo;
  }
  /** Ganancia final de la pista `i` (el nodo 0 es el maestro): último objetivo de la rampa o valor inicial. */
  ganancia(i: number): number {
    const g = this.ganancias[i + 1].gain;
    return g.ultima ?? g.value;
  }
  createBufferSource() {
    const inicios = this.inicios;
    return {
      buffer: null as unknown,
      connect: () => undefined,
      disconnect: () => undefined,
      start: (...args: number[]) => {
        inicios.push(args[1]);
      },
      stop: () => undefined,
    };
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

describe('EditorAvanzado — reproducción: salir cargando el audio y final recortado (D6)', () => {
  const DRAFT_KEY = 'gameclip.editor.draft.7';

  beforeEach(() => {
    FakeAudioContext.ultima = null;
  });
  afterEach(() => vi.unstubAllGlobals());

  /** Abre el clip (60 s) con una edición guardada con estos cortes. */
  async function prepararConCortes(segments: Array<{ start: number; end: number }>) {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        clipId: 7,
        updatedAt: 1,
        segments,
        volumes: {},
        removed: [],
        reframe: { aspect: 'original', mode: 'cover', zoom: 1, offset: { x: 0, y: 0 } },
      }),
    );
    await prepararClip();
  }

  /** rAF manual: cada `fotograma()` corre un tick del bucle de reproducción (determinista). */
  function controlarRaf() {
    let cola = new Map<number, FrameRequestCallback>();
    let siguiente = 1;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      const id = siguiente++;
      cola.set(id, cb);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      cola.delete(id);
    });
    return {
      fotograma() {
        const pendientes = [...cola.values()];
        cola = new Map();
        act(() => {
          for (const cb of pendientes) cb(performance.now());
        });
      },
    };
  }

  /**
   * jsdom no reproduce medios: se simula el <video> del editor. `seeks` registra cada asignación de
   * `currentTime` (los saltos que hace el editor) y `muteds` cada asignación de `muted`. Con
   * `buscaAlFijar`, cada salto deja `seeking` en true hasta que el test «aterriza» el vídeo.
   */
  function simularVideo({ buscaAlFijar = false } = {}) {
    const video = document.querySelector('video.eav-video') as HTMLVideoElement;
    const estado = { paused: true, ended: false, currentTime: 0, seeking: false, muted: false };
    const seeks: number[] = [];
    const muteds: boolean[] = [];
    // Posición del vídeo en cada llamada a play(): desde ahí sonaría (la mezcla original del <video>).
    const desdePlay: number[] = [];
    const play = vi.fn(() => {
      desdePlay.push(estado.currentTime);
      // Como el navegador: play() sobre un vídeo terminado vuelve a empezar desde 0.
      if (estado.ended) {
        estado.ended = false;
        estado.currentTime = 0;
      }
      estado.paused = false;
      return Promise.resolve();
    });
    const pause = vi.fn(() => {
      estado.paused = true;
    });
    Object.defineProperties(video, {
      paused: { configurable: true, get: () => estado.paused },
      seeking: { configurable: true, get: () => estado.seeking },
      currentTime: {
        configurable: true,
        get: () => estado.currentTime,
        set: (t: number) => {
          seeks.push(t);
          estado.currentTime = t;
          estado.ended = false;
          if (buscaAlFijar) estado.seeking = true;
        },
      },
      muted: {
        configurable: true,
        get: () => estado.muted,
        set: (m: boolean) => {
          muteds.push(m);
          estado.muted = m;
        },
      },
      play: { configurable: true, value: play },
      pause: { configurable: true, value: pause },
    });
    return { video, estado, seeks, muteds, desdePlay, play, pause };
  }

  const reproducir = () => screen.getByRole('button', { name: 'Reproducir' });
  const posicion = () => screen.getByLabelText('Posición de reproducción');

  it('regresión D6-BUG-1: salir mientras carga el audio no deja el clip sonando en segundo plano', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    controlarRaf();
    let soltarAudio: (bytes: ArrayBuffer) => void = () => undefined;
    mock().editor.getTrackAudio.mockReturnValue(
      new Promise<ArrayBuffer>((resolve) => {
        soltarAudio = resolve;
      }),
    );
    await prepararClip();
    await screen.findByLabelText('Volumen de game'); // pistas listas: el primer ▶ carga su audio
    const v = simularVideo();

    fireEvent.click(reproducir());
    expect(await screen.findByText('Cargando audio…')).toBeInTheDocument();
    expect(mock().editor.getTrackAudio).toHaveBeenCalledTimes(2);
    // Mientras carga, ▶ está deshabilitado: un segundo clic no puede arrancar otra reproducción.
    expect(reproducir()).toBeDisabled();

    // «Salir» sigue habilitado durante la carga: el editor se desmonta (y libera el motor).
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect(await screen.findByText('Biblioteca')).toBeInTheDocument();

    // La carga del audio termina con el editor ya desmontado.
    await act(async () => {
      soltarAudio(new ArrayBuffer(16));
      await new Promise((r) => setTimeout(r, 0));
    });
    const ctx = FakeAudioContext.ultima!;
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(2); // la carga terminó de verdad
    // Antes: `v.muted = false` + `v.play()` sobre el <video> desmontado → el clip sonaba de
    // fondo sin forma de pararlo (y con el archivo abierto).
    expect(v.play).not.toHaveBeenCalled();
    expect(v.muteds).toEqual([]);
    expect(ctx.inicios).toEqual([]);
  });

  it('sin salir, al terminar de cargar el audio ▶ arranca: <video> mudo y audio en vivo desde el cursor', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    controlarRaf();
    let soltarAudio: (bytes: ArrayBuffer) => void = () => undefined;
    mock().editor.getTrackAudio.mockReturnValue(
      new Promise<ArrayBuffer>((resolve) => {
        soltarAudio = resolve;
      }),
    );
    await prepararClip();
    await screen.findByLabelText('Volumen de game');
    const v = simularVideo();
    v.estado.currentTime = 12;

    fireEvent.click(reproducir());
    await screen.findByText('Cargando audio…');
    expect(v.play).not.toHaveBeenCalled();

    await act(async () => {
      soltarAudio(new ArrayBuffer(16));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(await screen.findByRole('button', { name: 'Pausar' })).toBeInTheDocument();
    expect(screen.queryByText('Cargando audio…')).not.toBeInTheDocument();
    expect(v.play).toHaveBeenCalledTimes(1);
    expect(v.estado.muted).toBe(true); // con audio en vivo, el <video> va mudo
    // Una fuente por pista, desde el cursor.
    expect(FakeAudioContext.ultima!.inicios).toEqual([12, 12]);
    expect(v.seeks).toEqual([]); // dentro de un tramo no se reposiciona

    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    expect(v.pause).toHaveBeenCalledTimes(1);
    expect(reproducir()).toBeInTheDocument();
  });

  it('regresión D6-BUG-2: con el final recortado, ▶ tras llegar al final vuelve a empezar desde el primer tramo', async () => {
    const raf = controlarRaf();
    await prepararConCortes([{ start: 0, end: 40 }]);
    const v = simularVideo();

    fireEvent.click(reproducir());
    await screen.findByRole('button', { name: 'Pausar' });
    // El vídeo pasa del final recortado (40 s): el bucle para y deja el cursor en 40 s.
    v.estado.currentTime = 40.02;
    raf.fotograma();
    expect(v.pause).toHaveBeenCalledTimes(1);
    expect(reproducir()).toBeInTheDocument();
    expect(posicion()).toHaveAttribute('aria-valuenow', '40');

    // ▶ otra vez. Antes reanudaba en 40.02 s y el siguiente tick volvía a parar: ▶ no hacía nada.
    fireEvent.click(reproducir());
    await screen.findByRole('button', { name: 'Pausar' });
    expect(v.seeks).toEqual([0]);
    expect(v.play).toHaveBeenCalledTimes(2);
    expect(posicion()).toHaveAttribute('aria-valuenow', '0');
    raf.fotograma();
    raf.fotograma();
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument();
    expect(v.pause).toHaveBeenCalledTimes(1);
  });

  it('regresión D6-BUG-2 (audio en vivo): vuelve al inicio del primer tramo y el audio arranca allí al aterrizar el vídeo', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    mock().editor.getTrackAudio.mockResolvedValue(new ArrayBuffer(16));
    const raf = controlarRaf();
    await prepararConCortes([
      { start: 5, end: 20 },
      { start: 30, end: 40 },
    ]);
    await screen.findByLabelText('Volumen de game');
    const v = simularVideo({ buscaAlFijar: true });
    v.estado.currentTime = 35;

    fireEvent.click(reproducir());
    await screen.findByRole('button', { name: 'Pausar' });
    const ctx = FakeAudioContext.ultima!;
    expect(ctx.inicios).toEqual([35, 35]);
    v.estado.currentTime = 40.02; // pasa del final recortado
    raf.fotograma();
    expect(reproducir()).toBeInTheDocument();

    ctx.inicios.length = 0;
    fireEvent.click(reproducir());
    await screen.findByRole('button', { name: 'Pausar' });
    expect(v.seeks).toEqual([5]); // inicio del primer tramo conservado
    expect(v.estado.muted).toBe(true);
    // Mientras el <video> busca, el audio en vivo NO arranca: se adelantaría a la imagen y el
    // resync lo haría sonar «doble» (misma regla que el salto de huecos).
    expect(ctx.inicios).toEqual([]);
    raf.fotograma();
    expect(ctx.inicios).toEqual([]);
    // El vídeo aterriza: el audio arranca en el inicio del primer tramo, una sola vez.
    v.estado.seeking = false;
    raf.fotograma();
    expect(ctx.inicios).toEqual([5, 5]);
    raf.fotograma();
    expect(ctx.inicios).toEqual([5, 5]);
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument();
  });

  it('■ mientras el reinicio aún busca: el siguiente ▶ salta igualmente el principio recortado', async () => {
    const raf = controlarRaf();
    await prepararConCortes([
      { start: 5, end: 20 },
      { start: 30, end: 40 },
    ]);
    const v = simularVideo({ buscaAlFijar: true });
    v.estado.currentTime = 35;
    fireEvent.click(reproducir());
    await screen.findByRole('button', { name: 'Pausar' });
    v.estado.currentTime = 40.02; // pasa del final recortado
    raf.fotograma();

    fireEvent.click(reproducir()); // reinicio: busca el inicio del primer tramo (5 s)…
    await screen.findByRole('button', { name: 'Pausar' });
    raf.fotograma();
    fireEvent.click(screen.getByRole('button', { name: 'Detener' })); // …y ■ antes de que aterrice
    v.estado.seeking = false;
    expect(v.seeks).toEqual([5, 0]);

    // ▶ desde 0 (en el principio recortado): el bucle salta a 5 s, sin reproducir lo recortado.
    fireEvent.click(reproducir());
    await screen.findByRole('button', { name: 'Pausar' });
    raf.fotograma();
    expect(v.seeks).toEqual([5, 0, 5]);
  });

  it('■ mientras el bucle salta el principio recortado: el siguiente ▶ vuelve a saltarlo (mismo origen)', async () => {
    const raf = controlarRaf();
    await prepararConCortes([{ start: 5, end: 40 }]);
    const v = simularVideo({ buscaAlFijar: true });

    fireEvent.click(reproducir()); // desde 0: el bucle salta a 5 s…
    await screen.findByRole('button', { name: 'Pausar' });
    raf.fotograma();
    fireEvent.click(screen.getByRole('button', { name: 'Detener' })); // …y ■ antes de que aterrice
    v.estado.seeking = false;
    expect(v.seeks).toEqual([5, 0]);

    fireEvent.click(reproducir());
    await screen.findByRole('button', { name: 'Pausar' });
    raf.fotograma();
    expect(v.seeks).toEqual([5, 0, 5]);
  });

  it('en mitad de un tramo, ▶ no reposiciona el vídeo y ❚❚ pausa como siempre', async () => {
    const raf = controlarRaf();
    await prepararConCortes([{ start: 0, end: 40 }]);
    const v = simularVideo();
    v.estado.currentTime = 12;

    fireEvent.click(reproducir());
    await screen.findByRole('button', { name: 'Pausar' });
    raf.fotograma();
    expect(v.seeks).toEqual([]);
    expect(v.play).toHaveBeenCalledTimes(1);
    expect(v.estado.muted).toBe(false); // sin Web Audio (jsdom) suena la mezcla del <video>

    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    expect(v.pause).toHaveBeenCalledTimes(1);
    expect(reproducir()).toBeInTheDocument();
  });

  it('en un hueco con tramos después, ▶ no vuelve al primero: salta al siguiente tramo, sin bucle de saltos', async () => {
    const raf = controlarRaf();
    await prepararConCortes([
      { start: 0, end: 10 },
      { start: 30, end: 60 },
    ]);
    const v = simularVideo();
    v.estado.currentTime = 20; // en el hueco borrado

    fireEvent.click(reproducir());
    await screen.findByRole('button', { name: 'Pausar' });
    // El salto lo hace ▶ en el acto (Bug 4), no el primer tick; el bucle ya no lo repite.
    expect(v.seeks).toEqual([30]);
    raf.fotograma();
    raf.fotograma();
    expect(v.seeks).toEqual([30]);
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument();
  });

  it('durante la reproducción, el bucle sigue saltando el hueco borrado (ripple)', async () => {
    const raf = controlarRaf();
    await prepararConCortes([
      { start: 0, end: 10 },
      { start: 30, end: 60 },
    ]);
    const v = simularVideo();
    v.estado.currentTime = 5;

    fireEvent.click(reproducir());
    await screen.findByRole('button', { name: 'Pausar' });
    expect(v.seeks).toEqual([]); // dentro de un tramo: ▶ no reposiciona
    raf.fotograma();
    expect(v.seeks).toEqual([]);

    v.estado.currentTime = 10.02; // el vídeo entra en el hueco
    raf.fotograma();
    expect(v.seeks).toEqual([30]);
    raf.fotograma();
    expect(v.seeks).toEqual([30]); // emitido una sola vez
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument();
  });

  it('clip sin recortar: ▶ en mitad no reposiciona y, al terminar, ▶ vuelve a empezar desde 0', async () => {
    const raf = controlarRaf();
    await prepararClip();
    const v = simularVideo();
    v.estado.currentTime = 30;

    fireEvent.click(reproducir());
    await screen.findByRole('button', { name: 'Pausar' });
    raf.fotograma();
    expect(v.seeks).toEqual([]);

    // El vídeo termina solo (60 s): evento `ended`.
    Object.assign(v.estado, { currentTime: 60, paused: true, ended: true });
    fireEvent.ended(v.video);
    expect(reproducir()).toBeInTheDocument();

    fireEvent.click(reproducir());
    await screen.findByRole('button', { name: 'Pausar' });
    raf.fotograma();
    raf.fotograma();
    expect(v.estado.currentTime).toBe(0);
    expect(posicion()).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument();
  });

  // ---- Carga del audio: volumen (Bug 2) y ■ (Bug 3); ▶ desde un hueco (Bug 4) ----

  /**
   * La extracción del audio de las pistas queda pendiente hasta llamar a lo que devuelve (que
   * además deja correr las microtareas de la decodificación): simula un clip largo.
   */
  function audioPendiente() {
    let soltar: (bytes: ArrayBuffer) => void = () => undefined;
    mock().editor.getTrackAudio.mockReturnValue(
      new Promise<ArrayBuffer>((resolve) => {
        soltar = resolve;
      }),
    );
    return async () => {
      await act(async () => {
        soltar(new ArrayBuffer(16));
        await new Promise((r) => setTimeout(r, 0));
      });
    };
  }

  /** Abre el clip con Web Audio simulado y el audio por pista pendiente; ▶ aún sin pulsar. */
  async function abrirConAudioPendiente() {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const raf = controlarRaf();
    const terminarCarga = audioPendiente();
    await prepararClip();
    await screen.findByLabelText('Volumen de game'); // pistas listas: el primer ▶ carga su audio
    return { raf, terminarCarga, v: simularVideo() };
  }

  it('regresión Bug 2: un volumen cambiado durante «Cargando audio…» es el que suena al terminar', async () => {
    const { terminarCarga } = await abrirConAudioPendiente();

    fireEvent.click(reproducir());
    await screen.findByText('Cargando audio…');
    fireEvent.change(screen.getByLabelText('Volumen de game'), { target: { value: '30' } });
    expect(screen.getByLabelText('Volumen de game')).toHaveValue('30');

    await terminarCarga();
    await screen.findByRole('button', { name: 'Pausar' });
    const ctx = FakeAudioContext.ultima!;
    // Antes: al acabar la carga se reaplicaba el 100 % del render del clic (el slider marcaba 30 %).
    expect(ctx.ganancia(0)).toBeCloseTo(0.3); // game
    expect(ctx.ganancia(1)).toBe(1); // mic, intacta
    expect(screen.getByLabelText('Volumen de game')).toHaveValue('30');
  });

  it('regresión Bug 2: una pista quitada durante «Cargando audio…» no suena al terminar', async () => {
    const { terminarCarga } = await abrirConAudioPendiente();

    fireEvent.click(reproducir());
    await screen.findByText('Cargando audio…');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar mic' }));

    await terminarCarga();
    await screen.findByRole('button', { name: 'Pausar' });
    const ctx = FakeAudioContext.ultima!;
    expect(ctx.ganancia(1)).toBe(0); // mic quitada: antes sonaba al 100 %
    expect(ctx.ganancia(0)).toBe(1);
  });

  it('un volumen cambiado y una pista quitada ANTES del ▶ también se aplican al arrancar', async () => {
    const { terminarCarga } = await abrirConAudioPendiente();
    fireEvent.change(screen.getByLabelText('Volumen de game'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar mic' }));

    fireEvent.click(reproducir());
    await screen.findByText('Cargando audio…');
    await terminarCarga();
    await screen.findByRole('button', { name: 'Pausar' });
    const ctx = FakeAudioContext.ultima!;
    expect(ctx.ganancia(0)).toBeCloseTo(0.3);
    expect(ctx.ganancia(1)).toBe(0);

    // Con el motor ya cargado, restaurar la pista y subir el volumen suena en el acto.
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar mic' }));
    fireEvent.change(screen.getByLabelText('Volumen de game'), { target: { value: '150' } });
    expect(ctx.ganancia(1)).toBe(1);
    expect(ctx.ganancia(0)).toBeCloseTo(1.5);
  });

  it('regresión Bug 3: ■ durante «Cargando audio…» cancela el ▶ pendiente', async () => {
    const { terminarCarga, v } = await abrirConAudioPendiente();

    fireEvent.click(reproducir());
    await screen.findByText('Cargando audio…');
    fireEvent.click(screen.getByRole('button', { name: 'Detener' }));

    await terminarCarga();
    const ctx = FakeAudioContext.ultima!;
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(2); // la carga terminó de verdad
    // Antes: la carga terminaba y la reproducción arrancaba igual (vídeo mudo + audio desde 0).
    expect(v.play).not.toHaveBeenCalled();
    expect(v.muteds).toEqual([]);
    expect(ctx.inicios).toEqual([]);
    expect(screen.queryByText('Cargando audio…')).not.toBeInTheDocument();
    expect(reproducir()).toBeEnabled(); // el editor no queda atascado

    // El siguiente ▶ funciona con normalidad sobre el audio ya cargado.
    fireEvent.click(reproducir());
    await screen.findByRole('button', { name: 'Pausar' });
    expect(v.play).toHaveBeenCalledTimes(1);
    expect(v.estado.muted).toBe(true);
    expect(ctx.inicios).toEqual([0, 0]);
    expect(mock().editor.getTrackAudio).toHaveBeenCalledTimes(2); // sin recargar
  });

  it('regresión Bug 3: ▶ ■ ▶ con la carga en curso en la primera: solo cuenta el último ▶', async () => {
    const { terminarCarga, v } = await abrirConAudioPendiente();

    fireEvent.click(reproducir()); // intento 1: queda esperando la carga
    await screen.findByText('Cargando audio…');
    fireEvent.click(screen.getByRole('button', { name: 'Detener' })); // lo invalida
    await terminarCarga();
    expect(v.play).not.toHaveBeenCalled();

    fireEvent.click(reproducir()); // intento 2, ya con el audio cargado
    await screen.findByRole('button', { name: 'Pausar' });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0)); // por si algún intento viejo siguiera vivo
    });
    expect(v.play).toHaveBeenCalledTimes(1); // sin doble arranque
    expect(FakeAudioContext.ultima!.inicios).toEqual([0, 0]);
  });

  it('durante la carga, mover el cursor (timeline) no invalida el ▶: arranca desde donde está al terminar', async () => {
    const { terminarCarga, v } = await abrirConAudioPendiente();
    v.estado.currentTime = 20;

    fireEvent.click(reproducir());
    await screen.findByText('Cargando audio…');
    v.estado.currentTime = 7; // la timeline mueve el <video> mientras carga
    await terminarCarga();

    await screen.findByRole('button', { name: 'Pausar' });
    expect(v.desdePlay).toEqual([7]);
    expect(FakeAudioContext.ultima!.inicios).toEqual([7, 7]);
  });

  it('regresión Bug 4 (audio en vivo): ▶ desde un hueco salta antes de reproducir y el audio arranca al aterrizar', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    mock().editor.getTrackAudio.mockResolvedValue(new ArrayBuffer(16));
    const raf = controlarRaf();
    await prepararConCortes([
      { start: 0, end: 10 },
      { start: 30, end: 60 },
    ]);
    await screen.findByLabelText('Volumen de game');
    const v = simularVideo({ buscaAlFijar: true });
    v.estado.currentTime = 20; // cursor parado en el hueco borrado

    fireEvent.click(reproducir());
    await screen.findByRole('button', { name: 'Pausar' });
    const ctx = FakeAudioContext.ultima!;
    // Antes: play() arrancaba en 20 s y el audio en vivo también (inicios [20, 20]); el primer tick
    // saltaba a 30 s: ~1 fotograma de lo recortado.
    expect(v.seeks).toEqual([30]);
    expect(v.desdePlay).toEqual([30]);
    expect(v.estado.muted).toBe(true);
    expect(ctx.inicios).toEqual([]);
    // El cursor marca tiempo de salida: el origen 30 s va tras los 10 s del primer tramo.
    expect(posicion()).toHaveAttribute('aria-valuenow', '10');

    raf.fotograma(); // el vídeo aún busca: el audio sigue sin arrancar
    expect(ctx.inicios).toEqual([]);
    v.estado.seeking = false; // aterriza
    raf.fotograma();
    expect(ctx.inicios).toEqual([30, 30]);
    // Sin bucle de saltos: el destino (inicio del tramo) cuenta como dentro.
    raf.fotograma();
    raf.fotograma();
    expect(v.seeks).toEqual([30]);
    expect(ctx.inicios).toEqual([30, 30]);
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument();
  });

  it('regresión Bug 4 (sin audio en vivo): la mezcla original del <video> no suena desde el hueco', async () => {
    const raf = controlarRaf();
    await prepararConCortes([
      { start: 0, end: 10 },
      { start: 30, end: 60 },
    ]);
    const v = simularVideo();
    v.estado.currentTime = 20;

    fireEvent.click(reproducir());
    await screen.findByRole('button', { name: 'Pausar' });
    expect(v.seeks).toEqual([30]);
    expect(v.desdePlay).toEqual([30]); // antes [20]: sonaba el hueco hasta el primer tick
    expect(v.estado.muted).toBe(false); // sin Web Audio suena la mezcla del <video>
    raf.fotograma();
    raf.fotograma();
    expect(v.seeks).toEqual([30]);
  });

  it('regresión Bug 4: ▶ desde 0 con el principio recortado salta al primer tramo antes de reproducir', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    mock().editor.getTrackAudio.mockResolvedValue(new ArrayBuffer(16));
    const raf = controlarRaf();
    await prepararConCortes([{ start: 5, end: 40 }]);
    await screen.findByLabelText('Volumen de game');
    const v = simularVideo({ buscaAlFijar: true });

    fireEvent.click(reproducir());
    await screen.findByRole('button', { name: 'Pausar' });
    expect(v.seeks).toEqual([5]);
    expect(v.desdePlay).toEqual([5]);
    expect(FakeAudioContext.ultima!.inicios).toEqual([]);
    v.estado.seeking = false;
    raf.fotograma();
    expect(FakeAudioContext.ultima!.inicios).toEqual([5, 5]);
    raf.fotograma();
    expect(v.seeks).toEqual([5]);
  });

  it('▶ con el cursor justo en el fin de un tramo (t = end) salta al siguiente tramo', async () => {
    controlarRaf();
    await prepararConCortes([
      { start: 0, end: 10 },
      { start: 30, end: 60 },
    ]);
    const v = simularVideo();
    v.estado.currentTime = 10; // segmentAt es [start, end): el fin cuenta como hueco

    fireEvent.click(reproducir());
    await screen.findByRole('button', { name: 'Pausar' });
    expect(v.seeks).toEqual([30]);
    expect(v.desdePlay).toEqual([30]);
  });

  it('▶ justo en el inicio de un tramo (t = start) no reposiciona', async () => {
    controlarRaf();
    await prepararConCortes([
      { start: 0, end: 10 },
      { start: 30, end: 60 },
    ]);
    const v = simularVideo();
    v.estado.currentTime = 30;

    fireEvent.click(reproducir());
    await screen.findByRole('button', { name: 'Pausar' });
    expect(v.seeks).toEqual([]);
    expect(v.desdePlay).toEqual([30]);
  });

  it('■ tras ▶ desde un hueco y ▶ otra vez: vuelve a saltar el hueco, no reproduce lo recortado', async () => {
    const raf = controlarRaf();
    await prepararConCortes([{ start: 5, end: 40 }]);
    const v = simularVideo({ buscaAlFijar: true });

    fireEvent.click(reproducir()); // desde 0 (recortado): salta a 5 s
    await screen.findByRole('button', { name: 'Pausar' });
    fireEvent.click(screen.getByRole('button', { name: 'Detener' })); // ■ antes de aterrizar
    v.estado.seeking = false;
    expect(v.seeks).toEqual([5, 0]);

    fireEvent.click(reproducir());
    await screen.findByRole('button', { name: 'Pausar' });
    expect(v.seeks).toEqual([5, 0, 5]);
    expect(v.desdePlay).toEqual([5, 5]);
    raf.fotograma();
    expect(v.seeks).toEqual([5, 0, 5]);
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

describe('EditorAvanzado — clip aún sin duración en el catálogo (regresión: ediciones fantasma)', () => {
  const DRAFT_KEY = 'gameclip.editor.draft.7';

  /** jsdom no carga medios: se fija la duración del <video> y se dispara loadedMetadata. */
  function cargarVideo(duracion: number) {
    const video = document.querySelector('video.eav-video') as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { configurable: true, value: duracion });
    fireEvent.loadedMetadata(video);
  }

  async function abrirSinDuracion() {
    mock().library.get.mockResolvedValue(
      crearClip({ id: 7, title: 'Recién guardado', durationSeconds: null }),
    );
    renderEA();
    await screen.findByText(/Recién guardado/);
  }

  it('abrirlo y no tocar nada no guarda una edición sin terminar ni habilita Restablecer', async () => {
    localStorage.removeItem(DRAFT_KEY);
    await abrirSinDuracion();
    cargarVideo(60);
    await new Promise((r) => setTimeout(r, 400)); // más que el debounce del auto-guardado
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(screen.getByRole('button', { name: 'Restablecer' })).toBeDisabled();
  });

  it('una edición guardada con cortes se restaura con sus cortes al cargar el vídeo', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        clipId: 7,
        updatedAt: 1,
        segments: [
          { start: 0, end: 10 },
          { start: 20, end: 40 },
        ],
        volumes: {},
        removed: [],
        reframe: { aspect: 'original', mode: 'cover', zoom: 1, offset: { x: 0, y: 0 } },
      }),
    );
    await abrirSinDuracion();
    cargarVideo(60);
    expect(await screen.findByText(/2 segmentos/)).toBeInTheDocument();
    localStorage.removeItem(DRAFT_KEY);
  });
});

describe('EditorAvanzado — acciones y atajos tras el rediseño «Portada oscura»', () => {
  function seekRuler(clientX: number) {
    fireEvent.pointerDown(screen.getByLabelText('Posición de reproducción'), { clientX });
  }

  it('la barra de herramientas conserva todas sus acciones con su nombre accesible', async () => {
    await prepararClip();
    for (const nombre of [
      'Reproducir',
      'Detener',
      'Dividir',
      'Borrar segmento',
      'Deshacer',
      'Rehacer',
      'Restablecer',
      'Alejar',
      'Acercar',
      'Capturar fotograma',
      'Salir',
      'Renderizar vídeo',
    ]) {
      expect(screen.getByRole('button', { name: nombre })).toBeInTheDocument();
    }
  });

  it('la barra superior lleva el icono del juego y el título del clip', async () => {
    await prepararClip();
    expect(document.querySelector('.eav-topbar .gc-icon')).not.toBeNull();
    expect(screen.getByRole('heading', { name: /Jugada épica/ })).toBeInTheDocument();
  });

  it('los controles de encuadre siguen siendo botones con aria-pressed', async () => {
    await prepararClip();
    const original = screen.getByRole('button', { name: 'Original' });
    expect(original).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '9:16' }));
    expect(screen.getByRole('button', { name: '9:16' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Recorte' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Barras' })).toBeInTheDocument();
  });

  it('atajos: S divide, Ctrl+Z deshace, Ctrl+Y rehace y Supr borra el segmento elegido', async () => {
    await prepararClip();
    seekRuler(240); // 10 s
    fireEvent.keyDown(window, { key: 's' });
    expect(screen.getByText(/2 segmentos/)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(screen.queryByText(/segmentos/)).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    expect(screen.getByText(/2 segmentos/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Segmento 1/ }));
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(screen.queryByText(/segmentos/)).not.toBeInTheDocument();
  });

  it('la pista eliminada se atenúa con su nota y se puede restaurar', async () => {
    await prepararClip();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar mic' }));
    expect(document.querySelector('.eav-track.is-removed')).not.toBeNull();
    expect(screen.getByText(/no entra en el render/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar mic' }));
    expect(document.querySelector('.eav-track.is-removed')).toBeNull();
  });
});

describe('RenderDialog — cierre con clic fuera', () => {
  it('sin renderizar, el clic en el fondo cierra el diálogo', async () => {
    await prepararClip();
    fireEvent.click(screen.getByRole('button', { name: 'Renderizar vídeo' }));
    expect(screen.getByRole('dialog', { name: 'Renderizar vídeo' })).toBeInTheDocument();
    fireEvent.click(document.querySelector('.gc-modal-backdrop') as HTMLElement);
    expect(screen.queryByRole('dialog', { name: 'Renderizar vídeo' })).not.toBeInTheDocument();
  });

  it('mientras renderiza, el clic en el fondo NO lo cierra y se ofrece Cancelar', async () => {
    await prepararClip();
    mock().exporter.run.mockReturnValue(new Promise(() => undefined)); // render en curso
    fireEvent.click(screen.getByRole('button', { name: 'Renderizar vídeo' }));
    const botones = screen.getAllByRole('button', { name: 'Renderizar vídeo' });
    fireEvent.click(botones[botones.length - 1]);

    expect(await screen.findByLabelText('Progreso del render')).toBeInTheDocument();
    fireEvent.click(document.querySelector('.gc-modal-backdrop') as HTMLElement);
    expect(screen.getByRole('dialog', { name: 'Renderizar vídeo' })).toBeInTheDocument();
    expect(screen.getByLabelText('Progreso del render')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(mock().exporter.cancel).toHaveBeenCalled();
  });

  it('la calidad se elige con radios de un mismo grupo (tarjetas-radio)', async () => {
    await prepararClip();
    fireEvent.click(screen.getByRole('button', { name: 'Renderizar vídeo' }));
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /Media/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /Alta/ }));
    expect(screen.getByRole('radio', { name: /Alta/ })).toBeChecked();
  });
});
