import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import Editor from '../views/Editor';
import { crearClip } from './helpers';
import { crearGameclipMock } from './setup';

type GameclipMock = ReturnType<typeof crearGameclipMock>;

function mock(): GameclipMock {
  return window.gameclip as unknown as GameclipMock;
}

beforeEach(() => {
  Object.defineProperty(window, 'gameclip', { writable: true, value: crearGameclipMock() });
});

function renderEditor(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/editor" element={<Editor />} />
        <Route path="/editor/:clipId" element={<Editor />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Editor — carga', () => {
  it('sin clip invita a elegir uno en la Biblioteca', async () => {
    renderEditor('/editor');
    expect(await screen.findByText(/Elige un clip/)).toBeInTheDocument();
  });

  it('carga el clip de la ruta y muestra los controles de recorte', async () => {
    const clip = crearClip({ id: 7, title: 'Jugada épica', durationSeconds: 60 });
    mock().library.get.mockResolvedValue(clip);
    renderEditor('/editor/7');

    expect(await screen.findByText('Jugada épica')).toBeInTheDocument();
    expect(mock().library.get).toHaveBeenCalledWith(7);
    expect(screen.getByLabelText('Inicio del recorte')).toBeInTheDocument();
    expect(screen.getByLabelText('Fin del recorte')).toHaveValue('60');
  });

  it('clip inexistente muestra el aviso', async () => {
    mock().library.get.mockResolvedValue(null);
    renderEditor('/editor/99');
    expect(await screen.findByText(/ya no está en la biblioteca/)).toBeInTheDocument();
  });
});

describe('Editor — exportación', () => {
  async function prepararEditor() {
    const clip = crearClip({ id: 7, title: 'Para exportar', durationSeconds: 60 });
    mock().library.get.mockResolvedValue(clip);
    renderEditor('/editor/7');
    await screen.findByText('Para exportar');
  }

  it('exporta con el recorte y formato elegidos', async () => {
    const user = userEvent.setup();
    await prepararEditor();

    fireEvent.change(screen.getByLabelText('Inicio del recorte'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Fin del recorte'), { target: { value: '20' } });
    await user.selectOptions(screen.getByLabelText('Formato'), 'gif');
    await user.selectOptions(screen.getByLabelText('Calidad'), 'alta');
    await user.click(screen.getByRole('button', { name: 'Exportar…' }));

    expect(mock().exporter.run).toHaveBeenCalledWith({
      clipId: 7,
      startSeconds: 5,
      endSeconds: 20,
      format: 'gif',
      quality: 'alta',
      mutedTracks: [],
    });
  });

  it('el recorte no permite fin antes del inicio', async () => {
    await prepararEditor();

    fireEvent.change(screen.getByLabelText('Inicio del recorte'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Fin del recorte'), { target: { value: '10' } });

    // el fin queda al menos MIN_RECORTE por encima del inicio
    expect(Number((screen.getByLabelText('Fin del recorte') as HTMLInputElement).value)).toBeGreaterThan(30);
  });

  it('al terminar ofrece copiar al portapapeles y mostrar en carpeta', async () => {
    const user = userEvent.setup();
    await prepararEditor();

    await user.click(screen.getByRole('button', { name: 'Exportar…' }));

    expect(await screen.findByText('Exportación lista.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copiar al portapapeles' }));
    expect(mock().exporter.copyLast).toHaveBeenCalled();
    expect(await screen.findByText('Copiado ✓')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mostrar en carpeta' }));
    expect(mock().exporter.showLast).toHaveBeenCalled();
  });

  it('mientras exporta muestra progreso y permite cancelar', async () => {
    const user = userEvent.setup();
    await prepararEditor();
    let resolver!: (r: { status: string }) => void;
    mock().exporter.run.mockReturnValue(new Promise((res) => (resolver = res)));

    await user.click(screen.getByRole('button', { name: 'Exportar…' }));

    expect(screen.getByLabelText('Progreso de exportación')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(mock().exporter.cancel).toHaveBeenCalled();

    resolver({ status: 'canceled' });
    expect(await screen.findByRole('button', { name: 'Exportar…' })).toBeInTheDocument();
  });

  it('un error muestra el mensaje de ffmpeg', async () => {
    const user = userEvent.setup();
    await prepararEditor();
    mock().exporter.run.mockResolvedValue({ status: 'error', message: 'Invalid data' });

    await user.click(screen.getByRole('button', { name: 'Exportar…' }));

    expect(await screen.findByText('Invalid data')).toBeInTheDocument();
  });
});

describe('Editor — pistas de audio', () => {
  const pistasPorRol = [
    { index: 0, name: 'default' },
    { index: 1, name: 'game' },
    { index: 2, name: 'mic' },
    { index: 3, name: 'opera' },
  ];

  async function prepararConPistas(clip = crearClip({ id: 7, title: 'Con pistas' })) {
    mock().library.get.mockResolvedValue(clip);
    mock().editor.getAudioTracks.mockResolvedValue(pistasPorRol);
    renderEditor('/editor/7');
    await screen.findByLabelText('mic');
    return clip;
  }

  it('lista las pistas por nombre, sin la mezcla, todas marcadas', async () => {
    await prepararConPistas();

    expect(mock().editor.getAudioTracks).toHaveBeenCalledWith(7);
    expect(screen.getByLabelText('game')).toBeChecked();
    expect(screen.getByLabelText('mic')).toBeChecked();
    expect(screen.getByLabelText('opera')).toBeChecked();
    expect(screen.queryByLabelText('default')).not.toBeInTheDocument();
  });

  it('reabre el clip con las pistas muteadas que se guardaron', async () => {
    await prepararConPistas(crearClip({ id: 7, title: 'Editado', mutedTracks: ['mic'] }));

    expect(screen.getByLabelText('mic')).not.toBeChecked();
    expect(screen.getByLabelText('game')).toBeChecked();
  });

  it('exporta con las pistas desmarcadas', async () => {
    const user = userEvent.setup();
    await prepararConPistas();

    await user.click(screen.getByLabelText('mic'));
    await user.click(screen.getByRole('button', { name: 'Exportar…' }));

    expect(mock().exporter.run).toHaveBeenCalledWith(
      expect.objectContaining({ clipId: 7, mutedTracks: ['mic'] }),
    );
  });

  it('guardar edit aplica el mute al clip guardado y recarga el reproductor', async () => {
    const user = userEvent.setup();
    await prepararConPistas();
    const src = () => document.querySelector('video')?.getAttribute('src');
    const antes = src();

    await user.click(screen.getByLabelText('mic'));
    await user.click(screen.getByRole('button', { name: 'Guardar edit' }));

    expect(mock().editor.saveAudioEdit).toHaveBeenCalledWith(7, ['mic']);
    expect(await screen.findByText('Edit guardado ✓')).toBeInTheDocument();
    // el archivo se reescribió: la URL cambia para que Chromium no sirva el video cacheado
    expect(src()).not.toBe(antes);
  });

  it('un fallo de ffmpeg al guardar el edit se muestra', async () => {
    const user = userEvent.setup();
    await prepararConPistas();
    mock().editor.saveAudioEdit.mockResolvedValue({ status: 'error', message: 'Permission denied' });

    await user.click(screen.getByRole('button', { name: 'Guardar edit' }));

    expect(await screen.findByText('Permission denied')).toBeInTheDocument();
  });

  it('un clip sin pistas por rol muestra una sola pista y no deja guardar edit', async () => {
    mock().library.get.mockResolvedValue(crearClip({ id: 8, title: 'Escritorio' }));
    mock().editor.getAudioTracks.mockResolvedValue([{ index: 0, name: null }]);
    renderEditor('/editor/8');

    expect(await screen.findByLabelText('Audio')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar edit' })).toBeDisabled();
    expect(screen.getByText(/no tiene pistas por rol/)).toBeInTheDocument();
  });
});
