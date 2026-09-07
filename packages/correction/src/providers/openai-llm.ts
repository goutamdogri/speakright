import type { CorrectionProvider, CorrectionInput } from '../types.js';
import type { CorrectionResult, LLMProvider } from '@speakright/shared';
import { buildCorrectionPrompt, parseCorrectionResult } from '../prompt-builder.js';

/**
 * OpenAI LLM adapter — uses structured JSON output via the Responses API.
 */
export class OpenAiLlmProvider implements CorrectionProvider {
  readonly id: LLMProvider = 'openai';
  readonly name = 'OpenAI';
  readonly requiresApiKey = true;
  readonly requiresNetwork = true;

  private readonly apiKey: string;
  private readonly defaultModel: string;

  constructor(apiKey: string, defaultModel = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }

  async correct(input: CorrectionInput): Promise<CorrectionResult> {
    const prompt = buildCorrectionPrompt(input.transcript, input.context);

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.defaultModel,
        messages: [
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'correction_result',
            strict: true,
            schema: {
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
          },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI LLM failed (${res.status}): ${body}`);
    }

    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) throw new Error('OpenAI LLM returned empty response');
    return parseCorrectionResult(raw);
  }

  async check(): Promise<{ ok: boolean; message: string }> {
    if (!this.apiKey) return { ok: false, message: 'OpenAI API key is not configured' };
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok
        ? { ok: true, message: 'OpenAI API is reachable' }
        : { ok: false, message: `OpenAI API returned ${res.status}` };
    } catch (err) {
      return { ok: false, message: `OpenAI API error: ${(err as Error).message}` };
    }
  }

  async listModels(): Promise<string[]> {
    return ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'];
  }
}
