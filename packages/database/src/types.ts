import type { Severity } from '@speakright/shared';

export interface Session {
  id: string;
  startedAt: string;
  endedAt: string | null;
  sttProvider: string;
  sttModel: string;
  llmProvider: string;
  llmModel: string;
}

export interface Utterance {
  id: string;
  sessionId: string;
  sequenceNo: number;
  startedAt: string;
  endedAt: string;
  transcript: string;
  sttLatencyMs: number;
}

export interface Correction {
  id: string;
  utteranceId: string;
  createdAt: string;
  originalText: string;
  correctedText: string;
  betterFormation: string | null;
  hasCorrection: boolean;
  confidence: number;
  severity: Severity;
  llmLatencyMs: number;
}

export interface Issue {
  id: string;
  correctionId: string;
  type: string;
  subtype: string;
  original: string;
  correction: string;
  explanation: string;
}

export interface HistoryFilter {
  text?: string;
  startDate?: string;
  endDate?: string;
  issueType?: string;
  hasCorrection?: boolean;
  limit?: number;
  offset?: number;
}

export interface HistoryEntry {
  session: Session;
  utterance: Utterance;
  correction: Correction;
  issues: Issue[];
}
