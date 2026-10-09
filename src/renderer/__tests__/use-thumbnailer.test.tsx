import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useThumbnailer } from '../lib/useThumbnailer';
import { crearClip } from './helpers';
import { crearGameclipMock } from './setup';

type GameclipMock = ReturnType<typeof crearGameclipMock>;
const mock = () => window.gameclip as unknown as GameclipMock;

beforeEach(() => {
  Object.defineProperty(window, 'gameclip', { writable: true, value: crearGameclipMock() });
});

describe('useThumbnailer (regresión: un clip ilegible bloqueaba las miniaturas del resto)', () => {
  it('si la extracción del primer pendiente falla, pasa al siguiente', async () => {
    const roto = crearClip({ id: 1, durationSeconds: null, thumbnailPath: null });
    const bueno = crearClip({ id: 2, durationSeconds: null, thumbnailPath: null });
    const extraer = vi.fn((clip: { id: number }) =>
      Promise.resolve(clip.id === 1 ? null : { durationSeconds: 12, thumbnailDataUrl: 'data:image/jpeg;base64,AA' }),
    );

    renderHook(() => useThumbnailer([roto, bueno], extraer));

    await waitFor(() =>
      expect(mock().library.setMedia).toHaveBeenCalledWith(2, expect.objectContaining({ durationSeconds: 12 })),
    );
    expect(mock().library.setMedia).not.toHaveBeenCalledWith(1, expect.anything());
  });

  it('un vídeo sin duración (Infinity) guarda su miniatura pero no se reextrae en cada recarga', async () => {
    // MKV cortado o MP4 fragmentado: hay miniatura, pero el main descarta la duración no finita y
    // el clip sigue «pendiente». Antes se reextraía en cada recarga y bloqueaba a los de detrás.
    const sinDuracion = crearClip({ id: 1, durationSeconds: null, thumbnailPath: null });
    const bueno = crearClip({ id: 2, durationSeconds: null, thumbnailPath: null });
    const extraer = vi.fn((clip: { id: number }) =>
      Promise.resolve({
        durationSeconds: clip.id === 1 ? Infinity : 12,
        thumbnailDataUrl: 'data:image/jpeg;base64,AA',
      }),
    );

    const { rerender } = renderHook(({ clips }) => useThumbnailer(clips, extraer), {
      initialProps: { clips: [sinDuracion, bueno] },
    });
    await waitFor(() => expect(mock().library.setMedia).toHaveBeenCalledWith(1, expect.anything()));

    // La recarga tras `changed`: el clip 1 sigue sin duración en el catálogo.
    rerender({ clips: [{ ...sinDuracion }, { ...bueno }] });

    await waitFor(() =>
      expect(mock().library.setMedia).toHaveBeenCalledWith(2, expect.objectContaining({ durationSeconds: 12 })),
    );
    expect(extraer.mock.calls.filter(([c]) => c.id === 1)).toHaveLength(1);
  });
});
