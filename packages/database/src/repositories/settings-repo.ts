import type Database from 'better-sqlite3';

const TABLE = 'settings';

export class SettingsRepository {
  constructor(private db: Database.Database) {}

  get(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM ${TABLE} WHERE key = ?`).get(key) as any;
    return row?.value ?? null;
  }

  set(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO ${TABLE} (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value);
  }

  getAll(): Record<string, string> {
    const rows = this.db.prepare(`SELECT key, value FROM ${TABLE}`).all() as any[];
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  delete(key: string): void {
    this.db.prepare(`DELETE FROM ${TABLE} WHERE key = ?`).run(key);
  }
}
