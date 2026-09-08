import type { CorrectionProvider, CorrectionInput } from '../types.js';
import type { CorrectionResult, LLMProvider } from '@speakright/shared';
import { buildCorrectionPrompt, parseCorrectionResult } from '../prompt-builder.js';
import { buildCorrectionResponseFormat } from '../prompt-builder.js';
import { fetchOpenAiLikeModels } from '../model-lists.js';

/**
 * Groq LLM adapter — uses OpenAI-compatible chat completions.
 * Structured JSON output via response_format with JSON schema.
 */
export class GroqLlmProvider implements CorrectionProvider {
  readonly id: LLMProvider = 'groq';
  readonly name = 'Groq LLM';
  readonly requiresApiKey = true;
  readonly requiresNetwork = true;

  private readonly apiKey: string;
  private readonly defaultModel: string;

  constructor(apiKey: string, defaultModel = 'qwen/qwen3.6-27b') {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }

  async correct(input: CorrectionInput): Promise<CorrectionResult> {
    const prompt = buildCorrectionPrompt(input.transcript, input.context);
    const model = this.defaultModel;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        response_format: buildCorrectionResponseFormat(),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Groq LLM failed (${res.status}): ${body}`);
    }

    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) throw new Error('Groq LLM returned empty response');
    return parseCorrectionResult(raw);
  }

  async check(): Promise<{ ok: boolean; message: string }> {
    if (!this.apiKey) return { ok: false, message: 'Groq API key is not configured' };
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok
        ? { ok: true, message: 'Groq LLM API is reachable' }
        : { ok: false, message: `Groq API returned ${res.status}` };
    } catch (err) {
      return { ok: false, message: `Groq API error: ${(err as Error).message}` };
    }
  }

  async listModels(): Promise<string[]> {
    // Exclude non-chat endpoints (speech-to-text, TTS, prompt-guard).
    const EXCLUDE = /whisper|orpheus|prompt-guard/i;
    return fetchOpenAiLikeModels(
      'https://api.groq.com/openai/v1',
      this.apiKey,
      id => !EXCLUDE.test(id),
      [
        'qwen/qwen3.6-27b',
        'qwen/qwen3.8-27b',
        'groq/compound',
        'groq/compound-mini',
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b',
      ],
    );
  }
}
