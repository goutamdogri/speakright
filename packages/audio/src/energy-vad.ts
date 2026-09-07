export interface VadOptions {
  /** Samples of pre-roll to keep before speech onset. */
  preRollSamples?: number;
  /** Samples of silence after speech ends the utterance. */
  postRollSamples?: number;
  /** Root-mean-square energy threshold to treat a frame as speech. */
  vadSensitivity?: number;
  /** Silence duration (ms) that terminates an utterance. */
  silenceDurationMs?: number;
  /** Maximum utterance duration in milliseconds. */
  maxUtteranceMs?: number;
  /** Minimum speech duration in milliseconds to be considered real speech. */
  minSpeechMs?: number;
  sampleRate?: number;
}

export interface VadEvents {
  onSpeechStart: (timestampMs: number) => void;
  onSpeechEnd: (timestampMs: number) => void;
  onUtterance: (frames: Float32Array, startMs: number, endMs: number) => void;
  onMaxDurationReached: (frames: Float32Array, startMs: number) => void;
}

export const DEFAULT_VAD_OPTIONS: Required<Pick<VadOptions, 'preRollSamples' | 'postRollSamples' | 'vadSensitivity' | 'silenceDurationMs' | 'maxUtteranceMs' | 'minSpeechMs'>> = {
  preRollSamples: 0.3 * 16000,
  postRollSamples: 0.8 * 16000,
  vadSensitivity: 0.01,
  silenceDurationMs: 700,
  maxUtteranceMs: 10 * 1000,
  minSpeechMs: 150,
};

/**
 * Frame-level VAD state machine.
 *
 * This is a deterministic finite-state-machine implementation that looks at
 * per-frame energy to classify speech vs. silence. It requires zero external
 * dependencies and works cross-platform. A more sophisticated ML-based VAD
 * (Silero via onnxruntime) can slice into the same state machine by supplying
 * per-frame speech probability.
 *
 * Silence is tracked in *samples* (not frame counts) so the configured
 * silenceDurationMs is honored regardless of the size of the frames received.
 */
export class EnergyBasedVad {
  private readonly options: VadOptions;
  private readonly events: VadEvents;

  private state: 'idle' | 'speech' | 'post-roll' = 'idle';
  private preBuffer: Float32Array[] = [];
  private speechFrames: Float32Array[] = [];
  private speechStartMs = 0;
  private silenceSamples = 0;
  private maxUtteranceSamples: number;

  constructor(options: VadOptions, events: VadEvents) {
    this.options = { ...DEFAULT_VAD_OPTIONS, ...options };
    this.events = events;
    this.sampleRate = options.sampleRate ?? 16000;
    this.maxUtteranceSamples = Math.floor((this.options.maxUtteranceMs! / 1000) * this.sampleRate);
    this.silenceLimitSamples = Math.floor((this.options.silenceDurationMs! / 1000) * this.sampleRate);
  }

  private readonly sampleRate: number;
  private readonly silenceLimitSamples: number;

  private silenceLimit(): number {
    return this.silenceLimitSamples;
  }

  get isSpeaking(): boolean {
    return this.state !== 'idle';
  }

  /**
   * Processes one audio frame of Float32 PCM samples.
   *
   * @param samples Frame with samples at the configured sample rate.
   * @param timestampMs Monotonic timestamp of the frame's end (ms).
   */
  process(samples: Float32Array, timestampMs: number): void {
    const rms = this.computeRms(samples);

    if (this.state === 'idle') {
      if (rms >= this.energyThreshold()) {
        this.promoteToSpeech(samples, timestampMs);
      } else {
        this.pushToPreBuffer(samples);
      }
      return;
    }

    this.speechFrames.push(samples);

    if (rms < this.energyThreshold()) {
      // Silence frame (or containing silence) — accumulate silent samples.
      this.silenceSamples += this.silentSamplesOf(samples, this.energyThreshold());
      if (this.silenceSamples > this.silenceLimit()) {
        this.endUtterance(timestampMs);
        return;
      }
    } else {
      this.silenceSamples = 0;
    }

    if (this.speechLength() >= this.maxUtteranceSamples) {
      this.events.onMaxDurationReached(this.packSpeech(), this.speechStartMs);
      this.reset();
    }
  }

  reset(): void {
    this.state = 'idle';
    this.preBuffer = [];
    this.speechFrames = [];
    this.speechStartMs = 0;
    this.silenceSamples = 0;
  }

  /**
   * Returns the number of "silent" samples within a frame that is
   * predominantly below the energy threshold. For simplicity we treat a
   * low-RMS frame as fully silent and a high-RMS frame as fully speech;
   * mixed frames count their proportion of silent samples.
   */
  private silentSamplesOf(samples: Float32Array, threshold: number): number {
    const rms = this.computeRms(samples);
    if (rms >= threshold) return 0;
    // Count actual silent samples for accurate accumulation when frames mix.
    let silent = 0;
    for (let i = 0; i < samples.length; i++) {
      if (Math.abs(samples[i]) < threshold) silent++;
    }
    return silent;
  }

  private computeRms(samples: Float32Array): number {
    if (samples.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  private energyThreshold(): number {
    return this.options.vadSensitivity ?? 0.01;
  }

  private pushToPreBuffer(samples: Float32Array): void {
    this.preBuffer.push(samples);
    const totalFrames = this.preBuffer.reduce((a, b) => a + b.length, 0);
    const maxPre = this.options.preRollSamples ?? 0.3 * 16000;
    while (totalFrames > maxPre && this.preBuffer.length > 0) {
      this.preBuffer.shift();
    }
  }

  private promoteToSpeech(samples: Float32Array, timestampMs: number): void {
    this.state = 'speech';
    this.speechFrames = [...this.preBuffer];
    this.speechFrames.push(samples);
    this.silenceSamples = 0;
    this.speechStartMs = timestampMs;
    this.events.onSpeechStart(this.speechStartMs);
    this.preBuffer = [];
  }

  private speechLength(): number {
    let total = 0;
    for (const f of this.speechFrames) total += f.length;
    return total;
  }

  private packSpeech(): Float32Array {
    const frames = this.speechFrames;
    let total = 0;
    for (const f of frames) total += f.length;
    const packed = new Float32Array(total);
    let offset = 0;
    for (const f of frames) {
      packed.set(f, offset);
      offset += f.length;
    }
    return packed;
  }

  private endUtterance(timestampMs: number): void {
    const frames = this.packSpeech();
    const minSpeechSamples = Math.floor((this.options.minSpeechMs ?? 150) * this.sampleRate / 1000);

    this.events.onSpeechEnd(timestampMs);

    // Ignore very short captures that are likely noise clicks.
    if (frames.length >= minSpeechSamples) {
      this.events.onUtterance(frames, this.speechStartMs, timestampMs);
    }

    this.reset();
  }
}
