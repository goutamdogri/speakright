import { randomUUID } from 'node:crypto';
import type {
  CorrectionResult,
  DisplayCorrection,
  ListeningState,
  PipelineStatus,
  CloudProvider,
} from '@speakright/shared';
import type {
  SessionRepository,
  UtteranceRepository,
  CorrectionRepository,
} from '@speakright/database';
import type { SettingsManager } from '@speakright/settings';
import { CorrectionQueue } from '@speakright/queue';
import type { UtteranceSegment } from '@speakright/audio';
import { PipelineWorker } from './pipeline-worker.js';
import type { AudioHostController } from './audio-host-controller.js';

export interface PipelineOptions {
  settings: SettingsManager;
  sessionRepo: SessionRepository;
  utteranceRepo: UtteranceRepository;
  correctionRepo: CorrectionRepository;
  audioHost: AudioHostController;
  onCorrection: (display: DisplayCorrection) => void;
  onLiveEvent?: (event: PipelineLiveEvent) => void;
  /**
   * Resolves a cloud API key for a provider. Called in the main process only;
   * the resolved value is handed to the worker and never sent to a renderer.
   */
  getApiKey?: (provider: CloudProvider) => string | null;
}

/** Live telemetry emitted by the pipeline for UI streaming. */
export type PipelineLiveEvent =
  | { kind: 'utterance-received'; durationMs: number; at: number }
  | { kind: 'transcribing'; at: number }
  | { kind: 'transcript'; text: string; latencyMs: number; at: number }
  | { kind: 'correcting'; text: string; at: number }
  | { kind: 'correction'; hasCorrection: boolean; confidence: number; original: string; corrected: string; at: number }
  | { kind: 'skipped'; reason: string; at: number }
  | { kind: 'error'; message: string; at: number };

/**
 * Orchestrates the full pipeline:
 *   audio → VAD → STT → LLM → validate → persist → queue → display
 *
 * Runs in the main process. Audio segments arrive from the renderer
 * via IPC after VAD detection.
 */
export class PipelineController {
  private readonly options: PipelineOptions;
  private readonly worker: PipelineWorker;
  private readonly queue: CorrectionQueue;
  private listening: ListeningState = 'disabled';
  private sessionId: string | null = null;
  private sequenceCounter = 0;
  private contextWindow: string[] = [];
  // Serial processing queue: each VAD-detected chunk is transcribed, corrected,
  // and displayed one at a time (see issue #2 — no concurrent overlapping runs).
  private readonly pendingUtterances: UtteranceSegment[] = [];
  private processing = false;

  constructor(options: PipelineOptions) {
    this.options = options;

    this.worker = new PipelineWorker(this.resolveWorkerConfig());

    const overlay = options.settings.getSection('overlay');
    const correction = options.settings.getSection('correction');
    this.queue = new CorrectionQueue(
      {
        maxItems: overlay.queueLimit,
        displayDurationMs: overlay.displayDurationMs,
        confidenceThreshold: correction.confidenceThreshold,
      },
      {
        onShow: item => this.options.onCorrection(item),
        onEmpty: () => {},
        onAdvance: () => {},
      },
    );
  }

  /**
   * Called by the renderer when VAD detects a complete utterance.
   *
   * The utterance is enqueued and processed strictly one at a time: each chunk
   * goes through the full pipeline (STT → LLM → persist → display) before the
   * next chunk begins. This guarantees chunks never overlap or race, so
   * corrections display in the same order the chunks were spoken.
   * @param segment Audio samples normalized to 16kHz mono PCM.
   */
  handleUtterance(segment: UtteranceSegment): void {
    if (this.listening !== 'listening') return;
    this.pendingUtterances.push(segment);
    void this.processPendingUtterances();
  }

  private async processPendingUtterances(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.pendingUtterances.length > 0) {
        const segment = this.pendingUtterances.shift()!;
        if (this.listening !== 'listening') break;
        await this.processUtterance(segment);
      }
    } finally {
      this.processing = false;
    }
  }

  private async processUtterance(segment: UtteranceSegment): Promise<void> {
    this.emit({ kind: 'utterance-received', durationMs: segment.durationMs, at: Date.now() });

    // Convert Float32 → Int16 PCM byte array for STT providers
    const int16 = this.float32ToInt16(segment.samples);
    const audioBytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);

    try {
      this.emit({ kind: 'transcribing', at: Date.now() });
      const sttStart = Date.now();
      const transcript = await this.worker.transcribe(audioBytes);
      const sttLatencyMs = Date.now() - sttStart;

      if (!transcript.text?.trim()) {
        this.emit({ kind: 'skipped', reason: 'No speech recognized (empty transcript)', at: Date.now() });
        return;
      }

      this.emit({ kind: 'transcript', text: transcript.text, latencyMs: sttLatencyMs, at: Date.now() });

      const context = [...this.contextWindow.slice(-3)];
      this.emit({ kind: 'correcting', text: transcript.text, at: Date.now() });
      const llmStart = Date.now();
      const correction = await this.worker.correct(transcript.text, context);
      const llmLatencyMs = Date.now() - llmStart;

      this.persistResult(segment, transcript, correction, llmLatencyMs);

      this.contextWindow.push(transcript.text);
      if (this.contextWindow.length > 5) this.contextWindow.shift();

      const display = this.toDisplayCorrection(correction);
      this.emit({
        kind: 'correction',
        hasCorrection: display.hasCorrection,
        confidence: display.confidence,
        original: display.original,
        corrected: String(display.corrected ?? ''),
        at: Date.now(),
      });
      const threshold = this.options.settings.getSection('correction').confidenceThreshold;
      if (display.hasCorrection && display.confidence >= threshold) {
        this.queue.enqueue(display);
      }
    } catch (err) {
      console.error('[Pipeline] Utterance processing failed:', err);
      this.emit({ kind: 'error', message: (err as Error).message, at: Date.now() });
      this.listenForStateChange('error');
      setTimeout(() => {
        if (this.listening === 'error') this.listenForStateChange('listening');
      }, 3000);
    }
  }

  private emit(event: PipelineLiveEvent): void {
    this.options.onLiveEvent?.(event);
  }

  toggleListening(): ListeningState {
    if (this.listening === 'listening') {
      return this.stopListening();
    }
    return this.startListening();
  }

  pauseResume(): ListeningState {
    if (this.listening === 'listening') {
      this.queue.pause();
      return this.listenForStateChange('paused');
    }
    if (this.listening === 'paused') {
      this.queue.resume();
      return this.listenForStateChange('listening');
    }
    return this.listening;
  }

  startListening(): ListeningState {
    if (this.listening === 'listening') return this.listening;

    if (!this.sessionId) {
      const provider = this.options.settings.getSection('provider');
      this.sessionId = randomUUID();
      this.options.sessionRepo.startSession({
        id: this.sessionId,
        startedAt: new Date().toISOString(),
        endedAt: null,
        sttProvider: provider.stt,
        sttModel: provider.sttModel,
        llmProvider: provider.llm,
        llmModel: provider.llmModel,
      });
    }

    this.options.audioHost.start();
    // Resume/clear the display queue. After a stop() the queue is left paused,
    // so without this new corrections would sit in the queue and never reach the
    // always-on-top overlay (issue #1).
    this.queue.resume();
    return this.listenForStateChange('listening');
  }

  stopListening(): ListeningState {
    if (this.sessionId) {
      this.options.sessionRepo.endSession(this.sessionId, new Date().toISOString());
      this.sessionId = null;
    }
    this.contextWindow = [];
    // Drop any chunks still sitting in the serial queue from the ended session.
    this.pendingUtterances.length = 0;
    this.options.audioHost.stop();
    this.queue.pause();
    return this.listenForStateChange('disabled');
  }

  getStatus(): PipelineStatus {
    const provider = this.options.settings.getSection('provider');
    return {
      listening: this.listening,
      queueLength: this.queue.queueLength,
      currentCorrectionId: null,
      sttProvider: provider.stt,
      llmProvider: provider.llm,
    };
  }

  getSttHealth(): Record<string, { ok: boolean; message: string }> {
    return this.worker.getSttHealth();
  }

  getLlmHealth(): Record<string, { ok: boolean; message: string }> {
    return this.worker.getLlmHealth();
  }

  /** Real connectivity: cloud providers hit their API endpoints. */
  checkSttHealth(): Promise<Record<string, { ok: boolean; message: string }>> {
    return this.worker.checkSttHealth();
  }

  checkLlmHealth(): Promise<Record<string, { ok: boolean; message: string }>> {
    return this.worker.checkLlmHealth();
  }

  listSttModels(): Promise<string[]> {
    return this.worker.listSttModels();
  }

  listLlmModels(): Promise<string[]> {
    return this.worker.listLlmModels();
  }

  notifySettingsChanged(): void {
    const provider = this.options.settings.getSection('provider');
    this.worker.updateProviders(this.resolveWorkerConfig(provider));

    const overlay = this.options.settings.getSection('overlay');
    // Rebuild queue options (displayDurationMs can be changed at runtime).
    // TODO: Make queue options mutable rather than recreating.
    void overlay;
  }

  private resolveWorkerConfig(provider = this.options.settings.getSection('provider')) {
    return {
      sttProvider: provider.stt,
      sttModel: provider.sttModel,
      llmProvider: provider.llm,
      llmModel: provider.llmModel,
      llmPrompt: provider.llmPrompt,
      groqApiKey: this.options.getApiKey?.('groq') ?? undefined,
      openaiApiKey: this.options.getApiKey?.('openai') ?? undefined,
      geminiApiKey: this.options.getApiKey?.('gemini') ?? undefined,
    };
  }

  stop(): void {
    this.stopListening();
    this.queue.dispose();
  }

  private persistResult(
    segment: UtteranceSegment,
    transcript: { text: string; latencyMs: number },
    correction: CorrectionResult,
    llmLatencyMs: number,
  ): void {
    if (!this.sessionId) return;

    const utteranceId = randomUUID();
    this.options.utteranceRepo.insert({
      id: utteranceId,
      sessionId: this.sessionId,
      sequenceNo: this.sequenceCounter++,
      startedAt: new Date(segment.startTime).toISOString(),
      endedAt: new Date(segment.endTime).toISOString(),
      transcript: transcript.text,
      sttLatencyMs: transcript.latencyMs,
    });

    const correctionId = randomUUID();
    const issues = correction.issues?.map(issue => ({
      id: randomUUID(),
      correctionId,
      type: issue.type,
      subtype: issue.subtype,
      original: issue.original,
      correction: issue.correction,
      explanation: issue.explanation,
    })) ?? [];

    this.options.correctionRepo.insert(
      {
        id: correctionId,
        utteranceId,
        createdAt: new Date().toISOString(),
        originalText: correction.original,
        correctedText: correction.corrected,
        betterFormation: correction.better_formation ?? null,
        hasCorrection: correction.has_correction,
        confidence: correction.confidence,
        severity: correction.severity,
        llmLatencyMs,
      },
      issues,
    );
  }

  private toDisplayCorrection(result: CorrectionResult): DisplayCorrection {
    return {
      id: randomUUID(),
      sequenceNo: this.sequenceCounter,
      original: result.original,
      corrected: result.corrected || result.original,
      hasCorrection: result.has_correction,
      confidence: result.confidence,
      severity: result.severity,
      issues: result.issues ?? [],
      explanation: this.buildExplanation(result),
      timestamp: Date.now(),
    };
  }

  private buildExplanation(result: CorrectionResult): string {
    if (!result.has_correction) return '';
    if (!result.issues || result.issues.length === 0) return '';
    return result.issues.map(i => `• ${i.explanation}`).join('\n');
  }

  private float32ToInt16(samples: Float32Array): Int16Array {
    const out = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  private listenForStateChange(state: ListeningState): ListeningState {
    this.listening = state;
    // Broadcast to renderer via webContents in main/index.ts
    return state;
  }
}
