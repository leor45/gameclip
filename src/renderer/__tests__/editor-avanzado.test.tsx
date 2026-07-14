import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditorAvanzado from '../views/EditorAvanzado';
import { crearClip } from './helpers';
import { crearGameclipMock } from './setup';

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
