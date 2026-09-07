import type { CorrectionResult, LLMProvider } from '@speakright/shared';

export interface CorrectionInput {
  transcript: string;
  context?: string[];
  conversationContext?: string[];
}

export interface CorrectionProvider {
  readonly id: LLMProvider;
  readonly name: string;
  readonly requiresApiKey: boolean;
  readonly requiresNetwork: boolean;

  correct(input: CorrectionInput): Promise<CorrectionResult>;
  check(): Promise<{ ok: boolean; message: string }>;
  listModels(): Promise<string[]>;
}
