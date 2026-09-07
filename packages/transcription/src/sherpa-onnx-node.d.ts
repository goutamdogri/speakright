declare module 'sherpa-onnx-node' {
  export interface OnlineRecognizerConfig {
    featConfig?: { sampleRate?: number; featureDim?: number };
    modelConfig?: {
      transducer?: { encoder: string; decoder: string; joiner: string };
      paraformer?: { encoder: string; decoder: string };
      zipformer2Ctc?: { model: string };
      wenetCtc?: { model: string };
      tokens?: string;
      numThreads?: number;
      provider?: string;
      debug?: boolean;
    };
    decodingMethod?: string;
    enableEndpoint?: boolean;
    endpointConfig?: {
      rule1?: { minTrailingSilence?: number; mustTrailingSilence?: boolean; reportEndpoint?: boolean };
      rule2?: { minTrailingSilence?: number; maxTrailingSilence?: number; reportEndpoint?: boolean };
      rule3?: { minUtteranceLength?: number; reportEndpoint?: boolean };
    };
  }

  export class OnlineStream {
    acceptWaveform(obj: { samples: Float32Array | ArrayBuffer; sampleRate: number }): void;
    inputFinished(): void;
  }

  export class OnlineRecognizer {
    constructor(config: OnlineRecognizerConfig);
    config: { featConfig: { sampleRate: number; featureDim: number } };
    createStream(): OnlineStream;
    isReady(stream: OnlineStream): boolean;
    decode(stream: OnlineStream): void;
    getResult(stream: OnlineStream): { text: string; tokens?: string[] };
    reset(stream: OnlineStream): void;
  }
}