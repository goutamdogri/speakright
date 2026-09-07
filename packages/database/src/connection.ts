import Database from 'better-sqlite3';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { runMigrations } from './migrations.js';

export interface DatabaseConnection {
  db: Database.Database;
  close: () => void;
}

interface DatabaseOptions {
  /** Directory where speakright.db is stored (e.g. Electron's userData path). */
  baseDir: string;
  /** Per-connection override for the database filename. */
  filename?: string;
}

let instance: { db: Database.Database } | null = null;

/**
 * Creates or returns the singleton SQLite connection.
 * Uses better-sqlite3 in WAL mode for concurrent read performance.
 * The database lives in the requested base directory (typically the
 * application's per-user data directory, supplied by the host app).
 */
export function getDatabase(options?: DatabaseOptions): Database.Database {
  if (instance) return instance.db;

  const baseDir = options?.baseDir ?? process.cwd();
  mkdirSync(baseDir, { recursive: true });
  const dbPath = join(baseDir, options?.filename ?? 'speakright.db');

  const db = new Database(dbPath);

  // WAL mode for better concurrent read/write behavior
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Busy timeout: wait up to 5s for locks
  db.pragma('busy_timeout = 5000');

  runMigrations(db);
  instance = { db };

  return db;
}

export function closeDatabase(): void {
  if (instance) {
    instance.db.close();
    instance = null;
  }
}