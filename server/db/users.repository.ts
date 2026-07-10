import type { AppDatabase } from './database';

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: string;
}

export class UsersRepository {
  constructor(private readonly db: AppDatabase) {}

  create(email: string, passwordHash: string, displayName: string): UserRow {
    const result = this.db
      .prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
      .run(email, passwordHash, displayName);
    return this.findById(Number(result.lastInsertRowid))!;
  }

  findById(id: number): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  }

  findByEmail(email: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as
      | UserRow
      | undefined;
  }
}
