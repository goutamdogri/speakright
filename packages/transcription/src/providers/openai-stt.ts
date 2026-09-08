import type { SpeechToTextProvider, TranscriptionOptions } from '../types.js';
import type { Transcript, STTProvider } from '@speakright/shared';
import { pcmToWavBlob } from '../audio-utils.js';
import { fetchOpenAiLikeModels } from '../model-lists.js';

/**
 * OpenAI Whisper STT adapter.
 * Supports the new `gpt-transcribe`, `gpt-4o-transcribe`, and legacy `whisper-1` models.
 */
export class OpenAiSttProvider implements SpeechToTextProvider {
  readonly id: STTProvider = 'openai';
  readonly name = 'OpenAI Whisper';
  readonly requiresApiKey = true;
  readonly requiresNetwork = true;

  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async transcribe(audio: Uint8Array, options: TranscriptionOptions): Promise<Transcript> {
    const start = Date.now();
    const formData = new FormData();
    formData.append('file', pcmToWavBlob(audio), 'utterance.wav');
    formData.append('model', options.model ?? 'gpt-4o-mini-transcribe');
    formData.append('response_format', 'json');
    if (options.language) formData.append('language', options.language);

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI STT failed (${res.status}): ${body}`);
    }

    const json = await res.json();
    return {
      text: json.text,
      language: options.language,
      latencyMs: Date.now() - start,
      provider: 'openai',
    };
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
    return fetchOpenAiLikeModels(
      'https://api.openai.com/v1',
      this.apiKey,
      id => {
        const lower = id.toLowerCase();
        return lower.includes('whisper') || lower.includes('transcribe');
      },
      ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper-1'],
    );
  }
}
