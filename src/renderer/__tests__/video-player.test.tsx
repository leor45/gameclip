import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VideoPlayer, { VELOCIDADES, formatoTiempo } from '../components/library/VideoPlayer';

afterEach(cleanup);

/**
 * jsdom no reproduce vídeo: el `<video>` se sustituye por un doble con tiempo, duración, pausa,
 * volumen y velocidad propios, que dispara los mismos eventos que el real.
 */
function montar(duracion = 40) {
  render(<VideoPlayer src="gameclip-media://clip/1" title="Jefe final" />);
  const video = screen.getByTestId('player-video') as HTMLVideoElement;
  let t = 0;
  let pausado = true;
  let volumen = 1;
  let mudo = false;
  let velocidad = 1;
  Object.defineProperties(video, {
    duration: { configurable: true, get: () => duracion },
    currentTime: {
      configurable: true,
      get: () => t,
      set: (v: number) => {
        t = v;
        fireEvent.timeUpdate(video);
      },
    },
    paused: { configurable: true, get: () => pausado },
    ended: { configurable: true, get: () => false },
    volume: {
      configurable: true,
      get: () => volumen,
      set: (v: number) => {
        volumen = v;
        fireEvent.volumeChange(video);
      },
    },
    muted: {
      configurable: true,
      get: () => mudo,
      set: (v: boolean) => {
        mudo = v;
        fireEvent.volumeChange(video);
      },
    },
    playbackRate: {
      configurable: true,
      get: () => velocidad,
      set: (v: number) => {
        velocidad = v;
        fireEvent.rateChange(video);
      },
    },
  });
  video.play = vi.fn(() => {
    pausado = false;
    fireEvent.play(video);
    return Promise.resolve();
  });
  video.pause = vi.fn(() => {
    pausado = true;
    fireEvent.pause(video);
  });
  fireEvent.durationChange(video);
  return { video, tiempo: () => t, mudo: () => mudo, velocidad: () => velocidad };
}

describe('VideoPlayer', () => {
  it('formatoTiempo: m:ss y h:mm:ss', () => {
    expect(formatoTiempo(0)).toBe('0:00');
    expect(formatoTiempo(65.9)).toBe('1:05');
    expect(formatoTiempo(3725)).toBe('1:02:05');
    expect(formatoTiempo(Number.NaN)).toBe('0:00');
  });

  it('sin controles nativos, con autoplay y el tiempo total a la vista', () => {
    const { video } = montar(40);
    expect(video.controls).toBe(false);
    expect(video.autoplay).toBe(true);
    expect(screen.getByText('/ 0:40', { exact: false })).toBeInTheDocument();
  });

  it('±10 s con los botones, sin pasarse de 0 ni de la duración', async () => {
    const user = userEvent.setup();
    const { tiempo } = montar(40);
    await user.click(screen.getByRole('button', { name: 'Adelantar 10 segundos' }));
    expect(tiempo()).toBe(10);
    await user.click(screen.getByRole('button', { name: 'Retroceder 10 segundos' }));
    await user.click(screen.getByRole('button', { name: 'Retroceder 10 segundos' }));
    expect(tiempo()).toBe(0);
    for (let i = 0; i < 6; i++) {
      await user.click(screen.getByRole('button', { name: 'Adelantar 10 segundos' }));
    }
    expect(tiempo()).toBe(40);
  });

  it('teclado sin foco en ningún sitio: ← → ±5 s, J L ±10 s, Espacio/K, M', () => {
    const { video, tiempo, mudo } = montar(60);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(tiempo()).toBe(5);
    fireEvent.keyDown(document.body, { key: 'l' });
    expect(tiempo()).toBe(15);
    fireEvent.keyDown(document.body, { key: 'j' });
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(tiempo()).toBe(0);
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Pausa' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'k' });
    expect(video.pause).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: 'm' });
    expect(mudo()).toBe(true);
    fireEvent.keyDown(document.body, { key: 'm' });
    expect(mudo()).toBe(false);
  });

  it('↑ ↓, Intro y Esc no son suyos (los atiende la Biblioteca)', () => {
    const { tiempo, video } = montar(60);
    for (const key of ['ArrowUp', 'ArrowDown', 'Enter', 'Escape']) {
      const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      document.body.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
    }
    expect(tiempo()).toBe(0);
    expect(video.play).not.toHaveBeenCalled();
  });

  it('con un modal abierto o escribiendo en un campo, el teclado no es suyo', () => {
    const { tiempo } = montar(60);
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    modal.remove();
    const campo = document.createElement('input');
    document.body.appendChild(campo);
    fireEvent.keyDown(campo, { key: 'l' });
    campo.remove();
    expect(tiempo()).toBe(0);
  });

  it('Espacio sobre un botón del reproductor es solo el clic de ese botón', () => {
    const { video } = montar(60);
    const adelantar = screen.getByRole('button', { name: 'Adelantar 10 segundos' });
    fireEvent.keyDown(adelantar, { key: ' ' });
    expect(video.play).not.toHaveBeenCalled();
  });

  it('velocidad: menú con los pasos del nativo; elegir cambia playbackRate y cierra', async () => {
    const user = userEvent.setup();
    const { velocidad } = montar(60);
    await user.click(screen.getByRole('button', { name: 'Velocidad: Normal' }));
    const opciones = screen.getAllByRole('menuitemradio');
    expect(opciones).toHaveLength(VELOCIDADES.length);
    expect(screen.getByRole('menuitemradio', { name: 'Normal' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(screen.getByRole('menuitemradio', { name: '1,5×' }));
    expect(velocidad()).toBe(1.5);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Velocidad: 1,5×' })).toBeInTheDocument();
  });

  it('Esc en el menú de velocidad lo cierra sin dejar pasar el Esc (no cierra el clip)', async () => {
    const user = userEvent.setup();
    montar(60);
    const fuera = vi.fn();
    window.addEventListener('keydown', fuera);
    await user.click(screen.getByRole('button', { name: 'Velocidad: Normal' }));
    await user.keyboard('{Escape}');
    window.removeEventListener('keydown', fuera);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(fuera).not.toHaveBeenCalled();
  });

  it('los controles se ocultan tras un rato reproduciendo sin mover el ratón', () => {
    vi.useFakeTimers();
    try {
      const { video } = montar(60);
      const raiz = screen.getByRole('group', { name: 'Reproductor: Jefe final' });
      act(() => {
        void video.play();
      });
      expect(raiz).not.toHaveClass('is-idle');
      act(() => {
        vi.advanceTimersByTime(2100);
      });
      expect(raiz).toHaveClass('is-idle');
      fireEvent.pointerMove(raiz);
      expect(raiz).not.toHaveClass('is-idle');
    } finally {
      vi.useRealTimers();
    }
  });
});
