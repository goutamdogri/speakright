import type { CorrectionProvider, CorrectionInput } from '../types.js';
import type { CorrectionResult, LLMProvider } from '@speakright/shared';
import { buildCorrectionPrompt, parseCorrectionResult, CORRECTION_SYSTEM_PROMPT } from '../prompt-builder.js';
import { fetchGeminiModels } from '../model-lists.js';

/**
 * Gemini LLM adapter — uses generateContent API with responseSchema.
 */
export class GeminiLlmProvider implements CorrectionProvider {
  readonly id: LLMProvider = 'gemini';
  readonly name = 'Google Gemini';
  readonly requiresApiKey = true;
  readonly requiresNetwork = true;

  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly systemPrompt: string;

  constructor(apiKey: string, defaultModel = 'gemini-2.5-flash', systemPrompt = CORRECTION_SYSTEM_PROMPT) {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
    this.systemPrompt = systemPrompt;
  }

  async correct(input: CorrectionInput): Promise<CorrectionResult> {
    const prompt = buildCorrectionPrompt(input.transcript, input.context);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.defaultModel}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: this.systemPrompt }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            responseMimeType: 'application/json',
            responseSchema: {
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
                  },
                },
                better_formation: { type: 'string' },
                severity: { type: 'string' },
              },
              required: ['original', 'corrected', 'has_correction', 'confidence', 'issues', 'severity'],
            },
          },
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini LLM failed (${res.status}): ${body}`);
    }

    const json = await res.json();
    const raw = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error('Gemini LLM returned empty response');
    return parseCorrectionResult(raw);
  }

  async check(): Promise<{ ok: boolean; message: string }> {
    if (!this.apiKey) return { ok: false, message: 'Gemini API key is not configured' };
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`,
      );
      return res.ok
        ? { ok: true, message: 'Gemini API is reachable' }
        : { ok: false, message: `Gemini API returned ${res.status}` };
    } catch (err) {
      return { ok: false, message: `Gemini API error: ${(err as Error).message}` };
    }
  }

  async listModels(): Promise<string[]> {
    return fetchGeminiModels(this.apiKey, ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro']);
  }
}
