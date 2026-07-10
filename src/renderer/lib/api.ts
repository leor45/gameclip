import { SERVER_URL } from '@shared/config';
import type { AuthSession, AuthTokens } from '@shared/auth';

const STORAGE_KEY = 'gameclip.session';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession | null): void {
  if (session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `Error ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) message = body.error;
  } catch {
    // sin cuerpo JSON: se conserva el mensaje genérico
  }
  return new ApiError(res.status, message);
}

async function rawRequest(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`${SERVER_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor de GameClip.');
  }
}

async function tryRefresh(tokens: AuthTokens): Promise<AuthSession | null> {
  const res = await rawRequest('/api/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });
  if (!res.ok) return null;
  const session = (await res.json()) as AuthSession;
  saveSession(session);
  return session;
}

// Petición autenticada: añade el Bearer y, ante un 401, intenta un refresh único y reintenta.
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = loadSession();
  const withAuth = (token?: string): RequestInit =>
    token ? { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } } : init;

  let res = await rawRequest(path, withAuth(session?.tokens.accessToken));

  if (res.status === 401 && session) {
    const renewed = await tryRefresh(session.tokens);
    if (!renewed) {
      saveSession(null);
      throw new ApiError(401, 'La sesión expiró; inicia sesión de nuevo.');
    }
    res = await rawRequest(path, withAuth(renewed.tokens.accessToken));
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Peticiones de auth sin Bearer (login/registro/logout).
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await rawRequest(path, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
