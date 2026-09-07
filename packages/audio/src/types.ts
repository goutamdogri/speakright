export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  kind: 'audioinput';
}

export interface AudioCaptureOptions {
  deviceId?: string | null;
  sampleRate?: number;
  channelCount?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
}

export interface CapturedAudioFrame {
  /** Float32 PCM samples, mono */
  samples: Float32Array;
  sampleRate: number;
  timestamp: number;
}

export interface AudioCaptureCallbacks {
  onFrame: (frame: CapturedAudioFrame) => void;
  onError: (error: Error) => void;
}

/**
 * Abstraction over getUserMedia-based microphone capture.
 *
 * The renderer (Chromium) uses the Web Audio API via getUserMedia to
 * capture mic audio at 16kHz mono. This runs in the renderer process
 * so the always-on-top overlay remains responsive.
 */
export interface MicrophoneCapture {
  start(options?: AudioCaptureOptions): Promise<void>;
  stop(): void;
  getDevices(): Promise<AudioDeviceInfo[]>;
  isRunning(): boolean;
}

export interface UtteranceSegment {
  /** Float32 PCM mono samples at 16kHz */
  samples: Float32Array;
  sampleRate: number;
  startTime: number;
  endTime: number;
  durationMs: number;
}

export interface AudioPipelineOptions {
  deviceId?: string | null;
  sampleRate?: number;
  vadSensitivity?: number;
  silenceDurationMs?: number;
  maxUtteranceMs?: number;
  minSpeechMs?: number;
  /** Path prefix where Silero ONNX models are bundled (local) */
  modelPathPrefix?: string;
}

export interface AudioPipelineCallbacks {
  onUtterance: (segment: UtteranceSegment) => void;
  onListeningStateChange: (listening: boolean) => void;
  onError: (error: Error) => void;
}

/**
 * End-to-end audio pipeline: microphone → VAD → complete utterances.
 * Only complete spoken utterances flow downstream — no fixed-interval polling.
 */
export interface AudioPipeline {
  start(): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
  isListening(): boolean;
  isPaused(): boolean;
  setDevice(deviceId: string | null): Promise<void>;
}
