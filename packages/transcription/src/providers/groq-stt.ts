import type { SpeechToTextProvider, TranscriptionOptions } from '../types.js';
import type { Transcript, STTProvider } from '@speakright/shared';
import { pcmToWavBlob } from '../audio-utils.js';

/**
 * Groq STT adapter — uses OpenAI-compatible whisper endpoint.
 * Audio must be sent as a multipart file upload.
 */
export class GroqSttProvider implements SpeechToTextProvider {
  readonly id: STTProvider = 'groq';
  readonly name = 'Groq Whisper';
  readonly requiresApiKey = true;
  readonly requiresNetwork = true;

  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.groq.com/openai/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async transcribe(audio: Uint8Array, options: TranscriptionOptions): Promise<Transcript> {
    const start = Date.now();
    const formData = new FormData();
    formData.append('file', pcmToWavBlob(audio), 'utterance.wav');
    formData.append('model', options.model ?? 'whisper-large-v3-turbo');
    formData.append('response_format', 'verbose_json');
    if (options.language) formData.append('language', options.language);

    const res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Groq STT failed (${res.status}): ${body}`);
    }

    const json = await res.json();
    return {
      text: json.text,
      language: json.language ?? options.language,
      durationMs: json.duration ? json.duration * 1000 : undefined,
      latencyMs: Date.now() - start,
      provider: 'groq',
    };
  }

  async check(): Promise<{ ok: boolean; message: string }> {
    if (!this.apiKey) {
      return { ok: false, message: 'Groq API key is not configured' };
    }
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok
        ? { ok: true, message: 'Groq API is reachable' }
        : { ok: false, message: `Groq API returned ${res.status}` };
    } catch (err) {
      return { ok: false, message: `Groq API error: ${(err as Error).message}` };
    }
  }

  async listModels(): Promise<string[]> {
    return ['whisper-large-v3-turbo', 'whisper-large-v3'];
  }
}
