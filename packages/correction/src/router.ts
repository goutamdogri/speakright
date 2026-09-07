import type { CorrectionProvider, CorrectionInput } from './types.js';
import type { CorrectionResult, LLMProvider } from '@speakright/shared';

/**
 * Returns true if the error is a schema-validation failure (malformed LLM
 * output), which is retryable, versus a transport/provider error which is not.
 */
function isSchemaError(err: unknown): boolean {
  return err instanceof Error && err.name === 'ZodError';
}

/**
 * Routes correction requests to the currently configured LLM provider.
 * Handles retry logic and validation on malformed responses.
 */
export class CorrectionRouter {
  private providers = new Map<LLMProvider, CorrectionProvider>();
  private activeProviderId: LLMProvider = 'ollama';
  private readonly maxRetries = 1;

  register(provider: CorrectionProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregister(id: LLMProvider): void {
    this.providers.delete(id);
  }

  setActive(id: LLMProvider): void {
    if (!this.providers.has(id)) {
      throw new Error(`LLM provider "${id}" is not registered`);
    }
    this.activeProviderId = id;
  }

  getActive(): CorrectionProvider {
    const provider = this.providers.get(this.activeProviderId);
    if (!provider) throw new Error(`Active LLM provider "${this.activeProviderId}" is not available`);
    return provider;
  }

  async correct(input: CorrectionInput): Promise<CorrectionResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.getActive().correct(input);

        if (result.has_correction && result.issues.length === 0) {
          result.issues = [{
            type: 'grammar',
            subtype: 'general',
            original: input.transcript,
            correction: result.corrected,
            explanation: 'General correction applied',
          }];
        }

        if (!result.has_correction) {
          result.severity = 'low';
        }

        return result;
      } catch (err) {
        lastError = err as Error;

        if (isSchemaError(err)) {
          console.error(`[CorrectionRouter] Malformed LLM output (attempt ${attempt + 1}):`, (err as Error).message);
          continue;
        }

        throw err;
      }
    }

    throw lastError ?? new Error('All correction attempts failed');
  }

  async checkAll(): Promise<Record<LLMProvider, { ok: boolean; message: string }>> {
    const results = {} as Record<LLMProvider, { ok: boolean; message: string }>;
    for (const [id, provider] of this.providers) {
      results[id] = await provider.check();
    }
    return results;
  }

  async listAvailableModels(): Promise<string[]> {
    return this.getActive().listModels();
  }
}
