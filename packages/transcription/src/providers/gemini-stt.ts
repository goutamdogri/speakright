import type { SpeechToTextProvider, TranscriptionOptions } from '../types.js';
import type { Transcript, STTProvider } from '@speakright/shared';
import { toBase64 } from '../audio-utils.js';
import { fetchGeminiModels } from '../model-lists.js';

/**
 * Gemini STT adapter — uses Gemini's generateContent API with inline audio
 * for transcription, since Gemini can understand audio directly.
 */
export class GeminiSttProvider implements SpeechToTextProvider {
  readonly id: STTProvider = 'gemini';
  readonly name = 'Google Gemini STT';
  readonly requiresApiKey = true;
  readonly requiresNetwork = true;

  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async transcribe(audio: Uint8Array, options: TranscriptionOptions): Promise<Transcript> {
    const start = Date.now();
    const base64 = toBase64(audio);

    const body = {
      contents: [
        {
          parts: [
            {
              text: 'Transcribe the following audio exactly as spoken. Return ONLY the transcript text, nothing else.',
            },
            {
              inline_data: {
                mime_type: 'audio/wav',
                data: base64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 1024,
      },
    };

    const model = options.model ?? 'gemini-2.0-flash';
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini STT failed (${res.status}): ${body}`);
    }

    const json = await res.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    return {
      text,
      language: options.language,
      latencyMs: Date.now() - start,
      provider: 'gemini',
    };
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
