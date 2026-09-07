import type { Transcript, STTProvider } from '@speakright/shared';

export interface TranscriptionOptions {
  language?: string;
  temperature?: number;
  model?: string;
}

export interface SpeechToTextProvider {
  readonly id: STTProvider;
  readonly name: string;
  readonly requiresApiKey: boolean;
  readonly requiresNetwork: boolean;

  /** Transcribe audio bytes → text transcript. */
  transcribe(audio: Uint8Array, options: TranscriptionOptions): Promise<Transcript>;
  /** Validate provider is healthy (API key set, Ollama running, etc.). */
  check(): Promise<{ ok: boolean; message: string }>;
  /** Get available model names for this provider. */
  listModels(): Promise<string[]>;
}

export interface ProviderHealthStatus {
  stt: Record<STTProvider, { ok: boolean; message: string }>;
  llm: Record<import('@speakright/shared').LLMProvider, { ok: boolean; message: string }>;
}
