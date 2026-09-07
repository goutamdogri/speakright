import type { CorrectionProvider, CorrectionInput } from '../types.js';
import type { CorrectionResult, LLMProvider } from '@speakright/shared';
import { buildCorrectionPrompt, parseCorrectionResult } from '../prompt-builder.js';

/**
 * Local Ollama correction provider.
 *
 * Uses the official `ollama` package for structured JSON output.
 * Ollama's `format` field constrains output to match the JSON schema,
 * eliminating the need for post-hoc parsing.
 */
export class OllamaCorrectionProvider implements CorrectionProvider {
  readonly id: LLMProvider = 'ollama';
  readonly name = 'Ollama (Local)';
  readonly requiresApiKey = false;
  readonly requiresNetwork = false;

  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private ollamaClient: any = null;

  constructor(baseUrl = 'http://127.0.0.1:11434', defaultModel = 'llama3.1') {
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
  }

  private async getClient() {
    if (!this.ollamaClient) {
      const { Ollama } = await import('ollama');
      this.ollamaClient = new Ollama({ host: this.baseUrl });
    }
    return this.ollamaClient;
  }

  async correct(input: CorrectionInput): Promise<CorrectionResult> {
    const ollama = await this.getClient();
    const systemPrompt = buildCorrectionPrompt(input.transcript, input.context);
    const model = this.defaultModel;

    const response = await ollama.chat({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input.transcript },
      ],
      format: {
        type: 'object',
        properties: {
          original: { type: 'string' },
          corrected: { type: 'string' },
          has_correction: { type: 'boolean' },
          confidence: { type: 'number' },
          issues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                subtype: { type: 'string' },
                original: { type: 'string' },
                correction: { type: 'string' },
                explanation: { type: 'string' },
              },
              required: ['type', 'subtype', 'original', 'correction', 'explanation'],
            },
          },
          better_formation: { type: 'string' },
          severity: { type: 'string' },
        },
        required: ['original', 'corrected', 'has_correction', 'confidence', 'issues', 'severity'],
      },
      options: {
        temperature: 0.3,
      },
    });

    const raw = response.message.content;
    return parseCorrectionResult(raw);
  }

  async check(): Promise<{ ok: boolean; message: string }> {
    try {
      const ollama = await this.getClient();
      const res = await ollama.list();
      const hasModel = res.models?.some((m: any) => m.name.includes(this.defaultModel));
      if (!hasModel) {
        return {
          ok: false,
          message: `Model "${this.defaultModel}" not found in Ollama. Run: ollama pull ${this.defaultModel}`,
        };
      }
      return { ok: true, message: `Ollama is running with model ${this.defaultModel}` };
    } catch (err) {
      return {
        ok: false,
        message: `Ollama is not reachable. Start it with: ollama serve`,
      };
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const ollama = await this.getClient();
      const res = await ollama.list();
      return res.models?.map((m: any) => m.name) ?? [];
    } catch {
      return [];
    }
  }
}
