import type {
  AudioCaptureCallbacks,
  AudioCaptureOptions,
  AudioDeviceInfo,
  MicrophoneCapture,
} from './types.js';

/**
 * Browser (renderer) microphone capture using the Web Audio API.
 *
 * This is the primary capture implementation used in the Electron renderer.
 * It requests mic access via getUserMedia, routes it through an
 * AudioWorklet/MediaStreamAudioSourceNode, resamples to 16kHz mono, and
 * forwards Float32 PCM frames to registered callbacks.
 */
export class BrowserMicrophoneCapture implements MicrophoneCapture {
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private running = false;
  private readonly callbacks: AudioCaptureCallbacks;

  constructor(callbacks: AudioCaptureCallbacks) {
    this.callbacks = callbacks;
  }

  async getDevices(): Promise<AudioDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label, kind: 'audioinput' as const }));
    } catch (err) {
      throw new Error(`Failed to enumerate audio devices: ${(err as Error).message}`);
    }
  }

  async start(options: AudioCaptureOptions = {}): Promise<void> {
    if (this.running) return;

    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
        sampleRate: options.sampleRate ?? 16000,
        channelCount: options.channelCount ?? 1,
        echoCancellation: options.echoCancellation ?? true,
        noiseSuppression: options.noiseSuppression ?? true,
        autoGainControl: true,
      },
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const ctx = new AudioContext({ sampleRate: options.sampleRate ?? 16000 });
      const source = ctx.createMediaStreamSource(stream);

      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = event => {
        if (!this.running) return;
        const samples = event.inputBuffer.getChannelData(0);
        this.callbacks.onFrame({
          samples: new Float32Array(samples),
          sampleRate: ctx.sampleRate,
          timestamp: Date.now(),
        });
      };

      source.connect(processor);
      processor.connect(ctx.destination);

      this.audioContext = ctx;
      this.source = source;
      this.stream = stream;
      this.processor = processor;
      this.running = true;
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes('NotFoundError') || message.includes('deviceId') || message.includes('not found')) {
        this.callbacks.onError(new Error('Microphone not found. Please check your audio input device and try again.'));
      } else if (message.includes('NotAllowedError') || message.includes('permission')) {
        this.callbacks.onError(new Error('Microphone permission denied. Please enable microphone access for this app.'));
      } else {
        this.callbacks.onError(new Error(`Failed to start microphone: ${message}`));
      }
      throw err;
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    try {
      this.processor?.disconnect();
      this.source?.disconnect();
      this.stream?.getTracks().forEach(t => t.stop());
    } catch {
      // Ignore teardown errors
    }

    void this.audioContext?.close().catch(() => {});
    this.audioContext = null;
    this.source = null;
    this.stream = null;
    this.processor = null;
  }

  isRunning(): boolean {
    return this.running;
  }
}
