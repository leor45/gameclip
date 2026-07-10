import type { AppDatabase } from './database';

export interface RefreshTokenRow {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export class RefreshTokensRepository {
  constructor(private readonly db: AppDatabase) {}

  create(userId: number, tokenHash: string, expiresAt: Date): void {
    this.db
      .prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
      .run(userId, tokenHash, expiresAt.toISOString());
  }

  findByHash(tokenHash: string): RefreshTokenRow | undefined {
    return this.db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(tokenHash) as
      | RefreshTokenRow
      | undefined;
  }

  revoke(id: number): void {
    this.db
      .prepare(`UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE id = ?`)
      .run(id);
  }

  revokeAllForUser(userId: number): void {
    this.db
      .prepare(
        `UPDATE refresh_tokens SET revoked_at = datetime('now')
         WHERE user_id = ? AND revoked_at IS NULL`,
      )
      .run(userId);
  }
}
