import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import DraftsList from '../components/editor-avanzado/DraftsList';
import { crearClip } from './helpers';
import { crearGameclipMock } from './setup';

type GameclipMock = ReturnType<typeof crearGameclipMock>;
const mock = () => window.gameclip as unknown as GameclipMock;

const REFRAME = { aspect: 'original', mode: 'cover', zoom: 1, offset: { x: 0, y: 0 } };
function seedDraft(clipId: number, updatedAt: number) {
  localStorage.setItem(
    `gameclip.editor.draft.${clipId}`,
    JSON.stringify({
      clipId,
      updatedAt,
      segments: [{ start: 0, end: 60 }],
      volumes: {},
      removed: [],
      reframe: REFRAME,
    }),
  );
}

beforeEach(() => {
  Object.defineProperty(window, 'gameclip', { writable: true, value: crearGameclipMock() });
});

function renderList() {
  return render(
    <MemoryRouter>
      <DraftsList />
    </MemoryRouter>,
  );
}

describe('DraftsList — ediciones sin terminar', () => {
  it('sin ediciones muestra el mensaje sencillo', () => {
    renderList();
    expect(screen.getByText(/Aquí aparecerán tus ediciones sin terminar/)).toBeInTheDocument();
  });

  it('lista una edición con el título del vídeo y permite quitarla', async () => {
    seedDraft(7, 100);
    mock().library.list.mockResolvedValue([
      crearClip({ id: 7, title: 'Jugada épica', durationSeconds: 60 }),
    ]);
    renderList();

    expect(await screen.findByText('Jugada épica')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(screen.queryByText('Jugada épica')).not.toBeInTheDocument();
    expect(localStorage.getItem('gameclip.editor.draft.7')).toBeNull();
  });

  it('una edición cuyo vídeo ya no está lo dice en lenguaje sencillo', async () => {
    seedDraft(8, 100);
    mock().library.list.mockResolvedValue([]); // el clip 8 ya no existe
    renderList();

    expect(await screen.findByText('Este vídeo ya no está en tu biblioteca')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(localStorage.getItem('gameclip.editor.draft.8')).toBeNull();
  });
});
