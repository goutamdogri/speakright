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
  }

  updateProviders(partial: Partial<WorkerConfig>): void {
    this.config = { ...this.config, ...partial };
    this.setActive();
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

  private registerProviders(): void {
    const whisperBin = this.config.whisperBinPath ?? this.defaultWhisperBin();
    const whisperModelDir = this.config.whisperModelDir ?? this.defaultWhisperModelDir();
    const sherpaModelDir = this.config.sherpaModelDir ?? this.defaultSherpaModelDir();

    // Local providers
    this.sttRouter.register(new LocalWhisperProvider(whisperBin, whisperModelDir, this.config.sttModel));
    this.sttRouter.register(new SherpaOnnxSttProvider(sherpaModelDir));

    // Cloud STT
    if (this.config.groqApiKey) {
      this.sttRouter.register(new GroqSttProvider(this.config.groqApiKey));
    }
    if (this.config.openaiApiKey) {
      this.sttRouter.register(new OpenAiSttProvider(this.config.openaiApiKey));
    }
    if (this.config.geminiApiKey) {
      this.sttRouter.register(new GeminiSttProvider(this.config.geminiApiKey));
    }

    // LLM providers
    this.llmRouter.register(new OllamaCorrectionProvider('http://127.0.0.1:11434', this.config.llmModel));
    if (this.config.groqApiKey) {
      this.llmRouter.register(new GroqLlmProvider(this.config.groqApiKey, this.config.llmModel));
    }
    if (this.config.openaiApiKey) {
      this.llmRouter.register(new OpenAiLlmProvider(this.config.openaiApiKey, this.config.llmModel));
    }
    if (this.config.geminiApiKey) {
      this.llmRouter.register(new GeminiLlmProvider(this.config.geminiApiKey, this.config.llmModel));
    }
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
}
