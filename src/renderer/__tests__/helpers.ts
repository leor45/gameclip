import type { AuthSession } from '@shared/auth';

export const sesionFalsa: AuthSession = {
  user: { id: 1, email: 'leo@gameclip.test', displayName: 'Leo' },
  tokens: { accessToken: 'access-falso', refreshToken: 'refresh-falso' },
};

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
