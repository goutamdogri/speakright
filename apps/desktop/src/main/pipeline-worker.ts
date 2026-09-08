import type { STTProvider, LLMProvider, Transcript } from '@speakright/shared';
import { LocalWhisperProvider } from '@speakright/transcription';
import { SherpaOnnxSttProvider } from '@speakright/transcription';
import { GroqSttProvider } from '@speakright/transcription';
import { OpenAiSttProvider } from '@speakright/transcription';
import { GeminiSttProvider } from '@speakright/transcription';
import { SpeechToTextRouter } from '@speakright/transcription';
import { OllamaCorrectionProvider } from '@speakright/correction';
import { GroqLlmProvider } from '@speakright/correction';
import { OpenAiLlmProvider } from '@speakright/correction';
import { GeminiLlmProvider } from '@speakright/correction';
import { CorrectionRouter } from '@speakright/correction';
import type { CorrectionResult } from '@speakright/shared';
import { app } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

export interface WorkerConfig {
  sttProvider: STTProvider;
  sttModel: string;
  llmProvider: LLMProvider;
  llmModel: string;
  whisperBinPath?: string;
  whisperModelDir?: string;
  sherpaModelDir?: string;
  // API keys
  groqApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
}

/**
 * Manages the STT + LLM provider lifecycle.
 *
 * Responsible for wiring concrete providers to tenant settings.
 * API keys are read from the secure credential store via the OS.
 */
export class PipelineWorker {
  private sttRouter: SpeechToTextRouter;
  private llmRouter: CorrectionRouter;
  private config: WorkerConfig;

  constructor(config: WorkerConfig) {
    this.config = config;
    this.sttRouter = new SpeechToTextRouter();
    this.llmRouter = new CorrectionRouter();
    this.registerProviders();
    this.setActive();
    // Self-heal a stale persisted model (e.g. a retired Groq model id) against
    // the provider's live catalog, without waiting for the user to re-pick.
    void this.validateProviderModels();
  }

  updateProviders(partial: Partial<WorkerConfig>): void {
    const next = { ...this.config, ...partial };
    // Providers capture their API key / binary / model dir at construction, so a
    // runtime change to any of those must rebuild the routers (otherwise a saved
    // key never reaches the registered provider → 401 on transcribe). Fields not
    // affecting providers (e.g. bare model-name switches) skip the rebuild to
    // avoid dropping the Sherpa recognizer cache.
    const relevant = [
      'sttProvider', 'sttModel', 'llmProvider', 'llmModel',
      'whisperBinPath', 'whisperModelDir', 'sherpaModelDir',
      'groqApiKey', 'openaiApiKey', 'geminiApiKey',
    ] as const;
    const changed = relevant.some(k => next[k] !== this.config[k]);
    this.config = next;
    if (changed) this.registerProviders();
    this.setActive();
    // Re-validate the active model against the provider's live catalog.
    void this.validateProviderModels();
  }

  private validateInFlight = false;
  private revalidateRequested = false;
  private static readonly CLOUD_STT = new Set<STTProvider>(['groq', 'openai', 'gemini']);
  private static readonly CLOUD_LLM = new Set<LLMProvider>(['groq', 'openai', 'gemini']);
  private static readonly PREFERRED_STT_MODEL: Record<string, string> = {
    groq: 'whisper-large-v3-turbo',
    openai: 'gpt-4o-mini-transcribe',
    gemini: 'gemini-2.5-flash',
  };
  private static readonly PREFERRED_LLM_MODEL: Record<string, string> = {
    groq: 'qwen/qwen3.6-27b',
    openai: 'gpt-4o-mini',
    gemini: 'gemini-2.5-flash',
  };

  /**
   * If the configured cloud model is stale (retired by the provider), switch
   * to the provider's preferred current model from its live catalog. Runs
   * fire-and-forget after any provider-config change and at startup, so a
   * persisted id that 404s never reaches transcription.
   */
  private async validateProviderModels(): Promise<void> {
    if (this.validateInFlight) {
      this.revalidateRequested = true;
      return;
    }
    this.validateInFlight = true;
    try {
      do {
        this.revalidateRequested = false;
        const patch: Partial<WorkerConfig> = {};
        if (PipelineWorker.CLOUD_STT.has(this.config.sttProvider)) {
          try {
            const list = await this.sttRouter.getActive().listModels();
            if (list.length && !list.includes(this.config.sttModel)) {
              patch.sttModel = list.includes(PipelineWorker.PREFERRED_STT_MODEL[this.config.sttProvider])
                ? PipelineWorker.PREFERRED_STT_MODEL[this.config.sttProvider]
                : list[0];
            }
          } catch { /* offline: keep the configured model */ }
        }
        if (PipelineWorker.CLOUD_LLM.has(this.config.llmProvider)) {
          try {
            const list = await this.llmRouter.getActive().listModels();
            if (list.length && !list.includes(this.config.llmModel)) {
              patch.llmModel = list.includes(PipelineWorker.PREFERRED_LLM_MODEL[this.config.llmProvider])
                ? PipelineWorker.PREFERRED_LLM_MODEL[this.config.llmProvider]
                : list[0];
            }
          } catch { /* offline: keep the configured model */ }
        }
        if (Object.keys(patch).length) {
          this.config = { ...this.config, ...patch };
          this.registerProviders();
          this.setActive();
        }
      } while (this.revalidateRequested);
    } finally {
      this.validateInFlight = false;
    }
  }

  async transcribe(audio: Uint8Array, language = 'en'): Promise<Transcript> {
    return this.sttRouter.transcribe(audio, {
      language,
      model: this.config.sttModel,
    });
  }

  async correct(transcript: string, context?: string[]): Promise<CorrectionResult> {
    return this.llmRouter.correct({ transcript, context });
  }

  /** Model catalog of the active STT provider (live fetch w/ curated fallback). */
  async listSttModels(): Promise<string[]> {
    try {
      return await this.sttRouter.listAvailableModels();
    } catch {
      return [];
    }
  }

  /** Model catalog of the active LLM provider (live fetch w/ curated fallback). */
  async listLlmModels(): Promise<string[]> {
    try {
      return await this.llmRouter.listAvailableModels();
    } catch {
      return [];
    }
  }

  getSttHealth(): Record<STTProvider, { ok: boolean; message: string }> {
    // Return synchronous status based on config
    const result = {} as Record<STTProvider, { ok: boolean; message: string }>;
    result['local-whisper'] = this.localWhisperHealth();
    result['sherpa-onnx'] = this.localSherpaHealth();
    result.groq = this.simpleHealth('groq');
    result.openai = this.simpleHealth('openai');
    result.gemini = this.simpleHealth('gemini');
    return result;
  }

  getLlmHealth(): Record<LLMProvider, { ok: boolean; message: string }> {
    const result = {} as Record<LLMProvider, { ok: boolean; message: string }>;
    result.ollama = { ok: true, message: this.config.llmModel ? `Ollama (${this.config.llmModel}) — ensure the server is running` : 'Ollama configured' };
    result.groq = this.simpleHealth('groq');
    result.openai = this.simpleHealth('openai');
    result.gemini = this.simpleHealth('gemini');
    return result;
  }

  private registerProviders(): void {
    const whisperBin = this.config.whisperBinPath ?? this.defaultWhisperBin();
    const whisperModelDir = this.config.whisperModelDir ?? this.defaultWhisperModelDir();
    const sherpaModelDir = this.config.sherpaModelDir ?? this.defaultSherpaModelDir();

    // Local providers
    this.sttRouter.register(new LocalWhisperProvider(whisperBin, whisperModelDir, this.config.sttModel));
    this.sttRouter.register(new SherpaOnnxSttProvider(sherpaModelDir));

    // Cloud STT (always registered so health/selection can report "no key").
    this.sttRouter.register(new GroqSttProvider(this.config.groqApiKey ?? ''));
    this.sttRouter.register(new OpenAiSttProvider(this.config.openaiApiKey ?? ''));
    this.sttRouter.register(new GeminiSttProvider(this.config.geminiApiKey ?? ''));

    // LLM providers
    this.llmRouter.register(new OllamaCorrectionProvider('http://127.0.0.1:11434', this.config.llmModel));
    this.llmRouter.register(new GroqLlmProvider(this.config.groqApiKey ?? '', this.config.llmModel));
    this.llmRouter.register(new OpenAiLlmProvider(this.config.openaiApiKey ?? '', this.config.llmModel));
    this.llmRouter.register(new GeminiLlmProvider(this.config.geminiApiKey ?? '', this.config.llmModel));
  }

  private setActive(): void {
    try {
      this.sttRouter.setActive(this.config.sttProvider);
    } catch (err) {
      console.error(`[Worker] STT provider "${this.config.sttProvider}" unavailable:`, (err as Error).message);
      this.sttRouter.setActive('local-whisper');
    }
    try {
      this.llmRouter.setActive(this.config.llmProvider);
    } catch (err) {
      console.error(`[Worker] LLM provider "${this.config.llmProvider}" unavailable:`, (err as Error).message);
      this.llmRouter.setActive('ollama');
    }
  }

  private defaultWhisperBin(): string {
    // In dev: look for whisper-cli on PATH or a well-known location
    // In prod: use the bundled binary from resources
    const candidates = [
      'whisper-cli',
      'whisper',
      join(app.getAppPath(), 'resources', 'whisper', 'whisper-cli'),
      join(app.getAppPath(), 'resources', 'whisper', 'main'),
      join(homedir(), '.local', 'bin', 'whisper-cli'),
      '/usr/local/bin/whisper-cli',
    ];
    for (const c of candidates) {
      const resolved = this.resolveOnPath(c);
      if (resolved) return resolved;
    }
    return '';
  }

  /**
   * Resolve a command name (or absolute path) to the real executable path.
   * Bare names are searched across PATH; explicit/absolute paths are checked
   * for existence and returned as-is if present.
   */
  private resolveOnPath(command: string): string | null {
    if (command.includes('/')) {
      return existsSync(command) ? command : null;
    }
    const pathDirs = (process.env.PATH ?? '').split(':');
    for (const dir of pathDirs) {
      if (!dir) continue;
      const candidate = join(dir, command);
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }

  private defaultWhisperModelDir(): string {
    const candidates = [
      join(app.getAppPath(), 'resources', 'whisper'),
      join(app.getPath('userData'), 'whisper'),
      join(homedir(), '.local', 'share', 'speakright', 'whisper'),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    // Fall back to the location the download script uses by default.
    return join(homedir(), '.local', 'share', 'speakright', 'whisper');
  }

  private defaultSherpaModelDir(): string {
    return join(homedir(), '.local', 'share', 'speakright', 'sherpa');
  }

  private localWhisperHealth(): { ok: boolean; message: string } {
    const bin = this.config.whisperBinPath ?? this.defaultWhisperBin();
    const dir = this.config.whisperModelDir ?? this.defaultWhisperModelDir();
    if (!bin) {
      return { ok: false, message: 'whisper-cli not found on PATH. Install whisper.cpp or set SPEAKRIGHT_WHISPER_BIN.' };
    }
    const model = join(dir, `ggml-${this.config.sttModel || 'base'}.en.bin`);
    if (!existsSync(model)) {
      return { ok: false, message: `Whisper model not found: ${model}. Run ./scripts/download-whisper-model.sh ${this.config.sttModel || 'base'}` };
    }
    return { ok: true, message: `Local Whisper is ready (${bin})` };
  }

  private localSherpaHealth(): { ok: boolean; message: string } {
    const dir = this.config.sherpaModelDir ?? this.defaultSherpaModelDir();
    if (!existsSync(dir)) {
      return { ok: false, message: `Sherpa-ONNX model dir not found: ${dir}. Run ./scripts/download-sherpa-model.sh` };
    }
    return { ok: true, message: 'Sherpa-ONNX Streaming Zipformer is ready' };
  }

  private simpleHealth(key: 'groq' | 'openai' | 'gemini'): { ok: boolean; message: string } {
    const keyConfig = key === 'groq' ? this.config.groqApiKey : key === 'openai' ? this.config.openaiApiKey : this.config.geminiApiKey;
    return keyConfig ? { ok: true, message: 'Configured' } : { ok: false, message: 'API key not set' };
  }

  /**
   * Real connectivity check: local providers by config, cloud providers by an
   * actual API call against their /models endpoint using the configured key.
   */
  async checkSttHealth(): Promise<Record<STTProvider, { ok: boolean; message: string }>> {
    const result = this.getSttHealth();
    for (const id of ['groq', 'openai', 'gemini'] as STTProvider[]) {
      const provider = this.sttRouter.getProvider(id);
      if (provider) result[id] = await provider.check();
    }
    return result;
  }

  /** Real connectivity check for the LLM providers (cloud providers). */
  async checkLlmHealth(): Promise<Record<LLMProvider, { ok: boolean; message: string }>> {
    const result = this.getLlmHealth();
    for (const id of ['groq', 'openai', 'gemini'] as LLMProvider[]) {
      const provider = this.llmRouter.getProvider(id);
      if (provider) result[id] = await provider.check();
    }
    return result;
  }
}
