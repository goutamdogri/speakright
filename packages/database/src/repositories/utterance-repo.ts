import type Database from 'better-sqlite3';
import type { Utterance } from '../types.js';

const TABLE = 'utterances';

export class UtteranceRepository {
  constructor(private db: Database.Database) {}

  insert(utterance: Utterance): void {
    this.db.prepare(`
      INSERT INTO ${TABLE} (id, session_id, sequence_no, started_at, ended_at, transcript, stt_latency_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      utterance.id,
      utterance.sessionId,
      utterance.sequenceNo,
      utterance.startedAt,
      utterance.endedAt,
      utterance.transcript,
      utterance.sttLatencyMs,
    );
  }

  getBySession(sessionId: string): Utterance[] {
    return (this.db.prepare(`
      SELECT * FROM ${TABLE} WHERE session_id = ? ORDER BY sequence_no ASC
    `).all(sessionId) as any[]).map(this.mapRow);
  }

  private mapRow(row: any): Utterance {
    return {
      id: row.id,
      sessionId: row.session_id,
      sequenceNo: row.sequence_no,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      transcript: row.transcript,
      sttLatencyMs: row.stt_latency_ms,
    };
  }
}
