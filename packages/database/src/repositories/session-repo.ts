import type Database from 'better-sqlite3';
import type { Session } from '../types.js';

const TABLE = 'sessions';

export class SessionRepository {
  constructor(private db: Database.Database) {}

  startSession(session: Session): void {
    this.db.prepare(`
      INSERT INTO ${TABLE} (id, started_at, ended_at, stt_provider, stt_model, llm_provider, llm_model)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(session.id, session.startedAt, null, session.sttProvider, session.sttModel, session.llmProvider, session.llmModel);
  }

  endSession(id: string, endedAt: string): void {
    this.db.prepare(`UPDATE ${TABLE} SET ended_at = ? WHERE id = ?`).run(endedAt, id);
  }

  getActiveSession(): Session | null {
    const row = this.db.prepare(`SELECT * FROM ${TABLE} WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1`).get() as any;
    return row ? this.mapRow(row) : null;
  }

  getSession(id: string): Session | null {
    const row = this.db.prepare(`SELECT * FROM ${TABLE} WHERE id = ?`).get(id) as any;
    return row ? this.mapRow(row) : null;
  }

  private mapRow(row: any): Session {
    return {
      id: row.id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      sttProvider: row.stt_provider,
      sttModel: row.stt_model,
      llmProvider: row.llm_provider,
      llmModel: row.llm_model,
    };
  }
}
