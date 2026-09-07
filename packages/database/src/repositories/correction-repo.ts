import type Database from 'better-sqlite3';
import type { Correction, HistoryEntry, HistoryFilter, Issue } from '../types.js';

const TABLE = 'corrections';

export class CorrectionRepository {
  constructor(private db: Database.Database) {}

  insert(correction: Correction, issues: Issue[]): void {
    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO ${TABLE} (id, utterance_id, created_at, original_text, corrected_text,
          better_formation, has_correction, confidence, severity, llm_latency_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        correction.id,
        correction.utteranceId,
        correction.createdAt,
        correction.originalText,
        correction.correctedText,
        correction.betterFormation,
        correction.hasCorrection ? 1 : 0,
        correction.confidence,
        correction.severity,
        correction.llmLatencyMs,
      );

      for (const issue of issues) {
        this.db.prepare(`
          INSERT INTO issues (id, correction_id, type, subtype, original, correction, explanation)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          issue.id,
          issue.correctionId,
          issue.type,
          issue.subtype,
          issue.original,
          issue.correction,
          issue.explanation,
        );
      }
    });

    tx();
  }

  getHistory(filter: HistoryFilter = {}): HistoryEntry[] {
    let sql = `
      SELECT c.id AS c_id, c.utterance_id, c.created_at, c.original_text, c.corrected_text,
             c.better_formation, c.has_correction, c.confidence, c.severity, c.llm_latency_ms,
             u.id AS u_id, u.session_id, u.sequence_no, u.started_at, u.ended_at, u.transcript, u.stt_latency_ms,
             s.id AS s_id, s.started_at AS s_started_at, s.ended_at AS s_ended_at,
             s.stt_provider, s.stt_model, s.llm_provider, s.llm_model
      FROM ${TABLE} c
      JOIN utterances u ON c.utterance_id = u.id
      JOIN sessions s ON u.session_id = s.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filter.text) {
      sql += ' AND (c.original_text LIKE ? OR c.corrected_text LIKE ?)';
      params.push(`%${filter.text}%`, `%${filter.text}%`);
    }
    if (filter.startDate) {
      sql += ' AND c.created_at >= ?';
      params.push(filter.startDate);
    }
    if (filter.endDate) {
      sql += ' AND c.created_at <= ?';
      params.push(filter.endDate);
    }
    if (filter.hasCorrection !== undefined) {
      sql += ' AND c.has_correction = ?';
      params.push(filter.hasCorrection ? 1 : 0);
    }

    sql += ' ORDER BY c.created_at DESC';
    sql += ' LIMIT ? OFFSET ?';
    params.push(filter.limit ?? 50, filter.offset ?? 0);

    const rows = this.db.prepare(sql).all(...params) as any[];

    return rows.map(row => {
      const issues = this.db.prepare(`
        SELECT * FROM issues WHERE correction_id = ? ORDER BY id
      `).all(row.c_id) as any[];

      return {
        session: {
          id: row.s_id,
          startedAt: row.s_started_at,
          endedAt: row.s_ended_at,
          sttProvider: row.stt_provider,
          sttModel: row.stt_model,
          llmProvider: row.llm_provider,
          llmModel: row.llm_model,
        },
        utterance: {
          id: row.u_id,
          sessionId: row.session_id,
          sequenceNo: row.sequence_no,
          startedAt: row.started_at,
          endedAt: row.ended_at,
          transcript: row.transcript,
          sttLatencyMs: row.stt_latency_ms,
        },
        correction: {
          id: row.c_id,
          utteranceId: row.utterance_id,
          createdAt: row.created_at,
          originalText: row.original_text,
          correctedText: row.corrected_text,
          betterFormation: row.better_formation,
          hasCorrection: row.has_correction === 1,
          confidence: row.confidence,
          severity: row.severity,
          llmLatencyMs: row.llm_latency_ms,
        },
        issues: issues.map(i => ({
          id: i.id,
          correctionId: i.correction_id,
          type: i.type,
          subtype: i.subtype,
          original: i.original,
          correction: i.correction,
          explanation: i.explanation,
        })),
      };
    });
  }

  deleteItem(id: string): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM issues WHERE correction_id = ?').run(id);
      this.db.prepare('DELETE FROM corrections WHERE id = ?').run(id);
    })();
  }

  clearAll(): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM issues').run();
      this.db.prepare('DELETE FROM corrections').run();
      this.db.prepare('DELETE FROM utterances').run();
      this.db.prepare('DELETE FROM sessions').run();
    })();
  }
}
