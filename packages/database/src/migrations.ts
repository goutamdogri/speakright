import type Database from 'better-sqlite3';

export const CURRENT_VERSION = 1;

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL DEFAULT 0
    );
  `);

  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
  const currentVersion = row?.version ?? 0;

  if (currentVersion < 1) {
    migrateV1(db);
  }

  if (currentVersion === 0) {
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(CURRENT_VERSION);
  } else {
    db.prepare('UPDATE schema_version SET version = ?').run(CURRENT_VERSION);
  }
}

function migrateV1(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      stt_provider TEXT NOT NULL,
      stt_model TEXT NOT NULL,
      llm_provider TEXT NOT NULL,
      llm_model TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS utterances (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      sequence_no INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      transcript TEXT NOT NULL,
      stt_latency_ms INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS corrections (
      id TEXT PRIMARY KEY,
      utterance_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      original_text TEXT NOT NULL,
      corrected_text TEXT NOT NULL,
      better_formation TEXT,
      has_correction INTEGER NOT NULL,
      confidence REAL NOT NULL,
      severity TEXT NOT NULL,
      llm_latency_ms INTEGER NOT NULL,
      raw_provider_response TEXT,
      FOREIGN KEY (utterance_id) REFERENCES utterances(id)
    );

    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      correction_id TEXT NOT NULL,
      type TEXT NOT NULL,
      subtype TEXT NOT NULL,
      original TEXT NOT NULL,
      correction TEXT NOT NULL,
      explanation TEXT NOT NULL,
      FOREIGN KEY (correction_id) REFERENCES corrections(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_utterances_session ON utterances(session_id);
    CREATE INDEX IF NOT EXISTS idx_corrections_utterance ON corrections(utterance_id);
    CREATE INDEX IF NOT EXISTS idx_issues_correction ON issues(correction_id);
    CREATE INDEX IF NOT EXISTS idx_corrections_created ON corrections(created_at);
    CREATE INDEX IF NOT EXISTS idx_corrections_severity ON corrections(severity);
  `);
}
