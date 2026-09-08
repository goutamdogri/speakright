import type { SpeechToTextProvider, TranscriptionOptions } from './types.js';
import type { Transcript, STTProvider } from '@speakright/shared';

/**
 * Routes STT requests to the currently configured provider.
 * Providers are registered lazily; the active provider is switched at runtime.
 */
export class SpeechToTextRouter {
  private providers = new Map<STTProvider, SpeechToTextProvider>();
  private activeProviderId: STTProvider = 'local-whisper';

  register(provider: SpeechToTextProvider): void {
    this.providers.set(provider.id, provider);
  }

  getProvider(id: STTProvider): SpeechToTextProvider | null {
    return this.providers.get(id) ?? null;
  }

  unregister(id: STTProvider): void {
    this.providers.delete(id);
  }

  setActive(id: STTProvider): void {
    if (!this.providers.has(id)) {
      throw new Error(`STT provider "${id}" is not registered`);
    }
    this.activeProviderId = id;
  }

  getActive(): SpeechToTextProvider {
    const provider = this.providers.get(this.activeProviderId);
    if (!provider) throw new Error(`Active STT provider "${this.activeProviderId}" is not available`);
    return provider;
  }

  async transcribe(audio: Uint8Array, options: TranscriptionOptions): Promise<Transcript> {
    return this.getActive().transcribe(audio, options);
  }

  async checkAll(): Promise<Record<STTProvider, { ok: boolean; message: string }>> {
    const results = {} as Record<STTProvider, { ok: boolean; message: string }>;
    for (const [id, provider] of this.providers) {
      results[id] = await provider.check();
    }
    return results;
  }

  async listAvailableModels(): Promise<string[]> {
    return this.getActive().listModels();
  }
}
