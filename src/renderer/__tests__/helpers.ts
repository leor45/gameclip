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
    ...parcial,
  };
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
