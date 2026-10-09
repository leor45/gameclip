// Tipos del dominio de autenticación compartidos entre server y renderer.

export interface User {
  id: number;
  email: string;
  displayName: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthSession {
  user: User;
  tokens: AuthTokens;
}

export interface RegisterPayload {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export const PASSWORD_MIN_LENGTH = 8;

/** Largo máximo de una dirección de correo (RFC 5321). */
const EMAIL_MAX_LENGTH = 254;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  // El largo se mira ANTES de la regex: con un dominio lleno de puntos que no cierra bien, la regex
  // retrocede en tiempo cuadrático (60 000 caracteres ≈ 3 s), y el server corre en el main de Electron.
  // Acotada a 254, el peor caso es instantáneo.
  return email.length <= EMAIL_MAX_LENGTH && EMAIL_RE.test(email);
}
