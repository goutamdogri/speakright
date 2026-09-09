import type { z } from 'zod';
import { correctionResultSchema } from './correction-schema.js';

export type CorrectionResult = z.infer<typeof correctionResultSchema>;
export type CorrectionIssue = z.infer<typeof correctionResultSchema>['issues'][number];
export type IssueType = CorrectionIssue['type'];
export type IssueSubtype = CorrectionIssue['subtype'];
export type Severity = z.infer<typeof correctionResultSchema>['severity'];
export type Confidence = 'high' | 'medium' | 'low';

export type STTProvider = 'local-whisper' | 'sherpa-onnx' | 'groq' | 'openai' | 'gemini';
export type LLMProvider = 'ollama' | 'groq' | 'openai' | 'gemini';
/** Providers that authenticate to a cloud API with an API key. */
export type CloudProvider = 'groq' | 'openai' | 'gemini';

export type SecretSource = 'keychain' | 'env' | 'memory' | 'none';

/**
 * What the renderer (UI) may know about a stored credential — never the
 * credential itself. `masked` shows only the last 4 characters.
 */
export interface SecretStatus {
  configured: boolean;
  source: SecretSource;
  masked?: string;
}

export interface Transcript {
  text: string;
  language?: string;
  durationMs?: number;
  latencyMs: number;
  provider: STTProvider;
}

export interface AudioChunk {
  /** Raw PCM16LE mono samples at 16kHz */
  data: Uint8Array;
  sampleRate: number;
  channels: number;
  startTime: number;
  endTime: number;
}

export type ListeningState = 'disabled' | 'listening' | 'paused' | 'error';

export type AppStatus = 'stopped' | 'running' | 'paused';

export interface PipelineStatus {
  listening: ListeningState;
  queueLength: number;
  currentCorrectionId: string | null;
  sttProvider: STTProvider;
  llmProvider: LLMProvider;
  lastError?: string;
}

export interface OverlaySettings {
  position: { x: number; y: number };
  width: number;
  opacity: number;
  fontSize: number;
  displayDurationMs: number;
  queueLimit: number;
}

export interface AudioSettings {
  deviceId: string | null;
  vadSensitivity: number;
  silenceDurationMs: number;
  maxUtteranceMs: number;
}

export interface CorrectionSettings {
  grammar: boolean;
  structure: boolean;
  formation: boolean;
  confidenceThreshold: number;
  showConfirmations: boolean;
}

export interface ProviderSettings {
  stt: STTProvider;
  sttModel: string;
  llm: LLMProvider;
  llmModel: string;
  /** System prompt used for LLM corrections; default = DEFAULT_CORRECTION_PROMPT. */
  llmPrompt: string;
  useLocalOnly: boolean;
  contextWindowSize: number;
}

export interface HotkeySettings {
  toggleListening: string;
  pauseResume: string;
  toggleOverlay: string;
}

export interface AppSettings {
  general: {
    launchAtStartup: boolean;
    language: string;
    /** UI appearance. Persisted here so it survives restarts. */
    theme: 'light' | 'dark';
  };
  audio: AudioSettings;
  provider: ProviderSettings;
  overlay: OverlaySettings;
  correction: CorrectionSettings;
  hotkeys: HotkeySettings;
  privacy: {
    localOnly: boolean;
    notifyOnCloud: boolean;
  };
}

export interface DisplayCorrection {
  id: string;
  sequenceNo: number;
  original: string;
  corrected: string;
  hasCorrection: boolean;
  confidence: number;
  severity: Severity;
  issues: CorrectionIssue[];
  explanation: string;
  timestamp: number;
}
