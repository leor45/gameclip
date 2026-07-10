import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { AuthSession, LoginPayload, RegisterPayload } from '@shared/auth';
import { apiPost, loadSession, saveSession } from '../lib/api';

interface AuthContextValue {
  session: AuthSession | null;
  login(payload: LoginPayload): Promise<void>;
  register(payload: RegisterPayload): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());

  const apply = useCallback((next: AuthSession | null) => {
    saveSession(next);
    setSession(next);
  }, []);

  const login = useCallback(
    async (payload: LoginPayload) => {
      apply(await apiPost<AuthSession>('/api/auth/login', payload));
    },
    [apply],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      apply(await apiPost<AuthSession>('/api/auth/register', payload));
    },
    [apply],
  );

  const logout = useCallback(async () => {
    const current = session;
    apply(null);
    if (current) {
      // Revocación en el server: si falla (server caído) la sesión local ya quedó cerrada.
      await apiPost('/api/auth/logout', {
        refreshToken: current.tokens.refreshToken,
      }).catch(() => undefined);
    }
  }, [apply, session]);

  return (
    <AuthContext.Provider value={{ session, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
