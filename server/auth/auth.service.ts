import { createHash, randomBytes } from 'node:crypto';
// bcryptjs (JS puro) en vez de bcrypt nativo: el server corre embebido en el proceso main, y un
// binario con ABI de Node no carga dentro de Electron. Los hashes son el mismo formato ($2b), así
// que los usuarios registrados antes siguen entrando.
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  PASSWORD_MIN_LENGTH,
  isValidEmail,
  type AuthSession,
  type User,
} from '../../src/shared/auth';
import type { AppDatabase } from '../db/database';
import { RefreshTokensRepository } from '../db/refresh-tokens.repository';
import { UsersRepository, type UserRow } from '../db/users.repository';

const BCRYPT_ROUNDS = 10;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 30;

export const JWT_SECRET = process.env.GAMECLIP_JWT_SECRET ?? 'gameclip-dev-secret';

// Error de dominio con status HTTP; las rutas lo traducen a la respuesta.
export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, displayName: row.display_name };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class AuthService {
  private readonly users: UsersRepository;
  private readonly refreshTokens: RefreshTokensRepository;

  constructor(db: AppDatabase) {
    this.users = new UsersRepository(db);
    this.refreshTokens = new RefreshTokensRepository(db);
  }

  async register(email: string, password: string, displayName: string): Promise<AuthSession> {
    if (!isValidEmail(email)) {
      throw new AuthError(400, 'El email no es válido.');
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      throw new AuthError(
        400,
        `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
      );
    }
    if (!displayName.trim()) {
      throw new AuthError(400, 'El nombre para mostrar es obligatorio.');
    }
    if (this.users.findByEmail(email)) {
      throw new AuthError(409, 'Ya existe una cuenta con ese email.');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const row = this.users.create(email, passwordHash, displayName.trim());
    return this.createSession(row);
  }

  async login(email: string, password: string): Promise<AuthSession> {
    const row = this.users.findByEmail(email);
    // Mismo error para email inexistente y contraseña errónea: no filtrar qué cuentas existen.
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      throw new AuthError(401, 'Email o contraseña incorrectos.');
    }
    return this.createSession(row);
  }

  refresh(refreshToken: string): AuthSession {
    const stored = this.refreshTokens.findByHash(hashToken(refreshToken));
    if (!stored || stored.revoked_at || new Date(stored.expires_at) <= new Date()) {
      throw new AuthError(401, 'La sesión expiró; inicia sesión de nuevo.');
    }
    const row = this.users.findById(stored.user_id);
    if (!row) {
      throw new AuthError(401, 'La sesión expiró; inicia sesión de nuevo.');
    }
    // Rotación: el token usado queda revocado y se emite uno nuevo.
    this.refreshTokens.revoke(stored.id);
    return this.createSession(row);
  }

  logout(refreshToken: string): void {
    const stored = this.refreshTokens.findByHash(hashToken(refreshToken));
    if (stored && !stored.revoked_at) {
      this.refreshTokens.revoke(stored.id);
    }
  }

  verifyAccess(accessToken: string): number {
    try {
      const payload = jwt.verify(accessToken, JWT_SECRET) as { sub?: string };
      const userId = Number(payload.sub);
      if (!Number.isInteger(userId)) throw new Error('sub inválido');
      return userId;
    } catch {
      throw new AuthError(401, 'Token inválido o expirado.');
    }
  }

  getUser(userId: number): User {
    const row = this.users.findById(userId);
    if (!row) throw new AuthError(401, 'Usuario no encontrado.');
    return toUser(row);
  }

  private createSession(row: UserRow): AuthSession {
    const accessToken = jwt.sign({}, JWT_SECRET, {
      subject: String(row.id),
      expiresIn: ACCESS_TOKEN_TTL,
    });
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    this.refreshTokens.create(row.id, hashToken(refreshToken), expiresAt);
    return { user: toUser(row), tokens: { accessToken, refreshToken } };
  }
}
