import { waitFor } from '@testing-library/react';
import type { AuthSession } from '@shared/auth';
import type { Clip } from '@shared/library';

export const sesionFalsa: AuthSession = {
  user: { id: 1, email: 'leo@gameclip.test', displayName: 'Leo' },
  tokens: { accessToken: 'access-falso', refreshToken: 'refresh-falso' },
};

let clipId = 0;
export function crearClip(parcial: Partial<Clip> = {}): Clip {
  clipId++;
  return {
    id: clipId,
    filePath: `C:\\Videos\\GameClip\\clip-${clipId}.mp4`,
    title: `Clip ${clipId}`,
    game: null,
    durationSeconds: 42,
    sizeBytes: 1024,
    favorite: false,
    tags: [],
    thumbnailPath: `C:\\thumbs\\${clipId}.jpg`,
    createdAt: '2026-07-10T18:00:00.000Z',
    source: 'replay',
    kind: 'video',
    mutedTracks: [],
    ...parcial,
  };
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface Clicador {
  click: (el: Element) => Promise<void>;
}

/** Opciones de la lista abierta del `<Select>` propio (va en un portal, fuera del campo). */
export function opcionesAbiertas(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.gc-select-menu [role="option"]'));
}

/** Abre un `<Select>` y devuelve sus opciones (espera a que exista la del valor pedido, si se da). */
export async function abrirOpciones(user: Clicador, campo: HTMLElement): Promise<HTMLElement[]> {
  await user.click(campo);
  await waitFor(() => {
    if (opcionesAbiertas().length === 0) throw new Error('La lista no se abrió');
  });
  return opcionesAbiertas();
}

/** Elige en un `<Select>` la opción de ese valor (el equivalente a `user.selectOptions`). */
export async function elegirOpcion(
  user: Clicador,
  campo: HTMLElement,
  valor: string | number,
): Promise<void> {
  await user.click(campo);
  let opcion: HTMLElement | undefined;
  await waitFor(() => {
    opcion = opcionesAbiertas().find((o) => o.dataset.value === String(valor));
    if (!opcion) throw new Error(`No hay opción con valor ${valor}`);
  });
  await user.click(opcion!);
}
