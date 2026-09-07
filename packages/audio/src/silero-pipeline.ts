import type { AudioDeviceInfo, AudioPipeline, AudioPipelineCallbacks, AudioPipelineOptions, UtteranceSegment } from './types.js';

/**
 * Real audio pipeline using @ricky0123/vad-web's MicVAD.
 *
 * MicVAD internally uses getUserMedia + Silero VAD (via onnxruntime-web)
 * and gives complete utterance audio (Float32Array @ 16kHz) through
 * onSpeechEnd. It is the recommended path for high-quality voice detection.
 *
 * NOTE: This pipeline runs in the renderer process (needs DOM/Web APIs).
 */
export class SileroVadAudioPipeline implements AudioPipeline {
  private vad: any = null;
  private listening = false;
  private paused = false;
  private readonly callbacks: AudioPipelineCallbacks;
  private readonly options: AudioPipelineOptions;

  constructor(options: AudioPipelineOptions, callbacks: AudioPipelineCallbacks) {
    this.options = options;
    this.callbacks = callbacks;
  }

  async start(): Promise<void> {
    if (this.listening) return;

    const { MicVAD } = await import('@ricky0123/vad-web');

    const vadOptions: any = {
      onSpeechStart: () => {
        if (!this.paused) this.callbacks.onListeningStateChange(true);
      },
      onSpeechEnd: (audio: Float32Array) => {
        if (this.paused) return;
        const durationMs = (audio.length / 16000) * 1000;
        const end = Date.now();
        const segment: UtteranceSegment = {
          samples: audio,
          sampleRate: 16000,
          startTime: end - durationMs,
          endTime: end,
          durationMs,
        };
        this.callbacks.onUtterance(segment);
      },
      onVADMisfire: () => {
        // Ignore misfires gracefully.
      },
      onError: (err: Error) => {
        this.callbacks.onError(err);
      },
      frameSamples: 512,
      speechDurationMS: this.options.minSpeechMs ?? 150,
      silenceDurationMS: this.options.silenceDurationMs ?? 700,
    };

    // Prefer an explicit microphone device id. vad-web's default getStream
    // always uses the system default, so we override it to include deviceId.
    if (this.options.deviceId) {
      const deviceId = this.options.deviceId;
      vadOptions.getStream = async () =>
        navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            deviceId: deviceId === 'default' ? undefined : { exact: deviceId },
            echoCancellation: true,
            autoGainControl: true,
            noiseSuppression: true,
          },
        });
    }

    // Allow custom Silero model path if bundled locally. vad-web resolves the
    // model + onnxruntime wasm relative to `baseAssetPath`/`onnxWASMBasePath`
    // (page-relative `./` by default, which maps to the app's static root in
    // dev and to the renderer output folder in production).
    if (this.options.modelPathPrefix) {
      const prefix = this.options.modelPathPrefix;
      vadOptions.baseAssetPath = `${prefix}/`;
      vadOptions.onnxWASMBasePath = `${prefix}/`;
      vadOptions.model = 'legacy';
    }

    this.vad = await MicVAD.new(vadOptions);

    try {
      await this.vad.start();
      this.listening = true;
      this.callbacks.onListeningStateChange(true);
    } catch (err) {
      this.callbacks.onError(err as Error);
      await this.cleanup();
      throw err;
    }
  }

  stop(): void {
    if (!this.listening) return;
    void this.vad?.pause?.();
    void this.vad?.stop?.().catch(() => {});
    this.listening = false;
    this.vad = null;
    this.callbacks.onListeningStateChange(false);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  isListening(): boolean {
    return this.listening;
  }

  isPaused(): boolean {
    return this.paused;
  }

  async setDevice(deviceId: string | null): Promise<void> {
    const wasListening = this.listening;
    if (deviceId === this.options.deviceId && !wasListening) return;

    // MicVAD opens the mic when started, so switching devices requires a
    // full restart of the pipeline.
    if (wasListening) {
      await this.cleanup();
      this.options.deviceId = deviceId;
      await this.start();
    } else {
      this.options.deviceId = deviceId;
    }
  }

  async getDevices(): Promise<AudioDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || 'Microphone', kind: 'audioinput' as const }));
    } catch (err) {
      throw new Error(`Failed to enumerate audio devices: ${(err as Error).message}`);
    }
  }

  private async cleanup(): Promise<void> {
    try {
      await this.vad?.destroy?.();
    } catch {
      // Ignore
    }
    this.vad = null;
    this.listening = false;
  }
}
