import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import type { SpeechToTextProvider, TranscriptionOptions } from '../types.js';
import type { Transcript, STTProvider } from '@speakright/shared';
import type { OnlineRecognizer, OnlineRecognizerConfig, OnlineStream } from 'sherpa-onnx-node';

const require = createRequire(import.meta.url);

/**
 * Sherpa-ONNX streaming Zipformer adapter.
 *
 * Uses sherpa-onnx-node's streaming `OnlineRecognizer` (a streamable
 * Zipformer transducer). Each utterance is drained through the recognizer
 * in 0.1s chunks and flushed with trailing silence before the final result
 * is read, so the same code can drive genuine real-time streaming later.
 *
 * Fully local and offline. The model is a directory under `modelRoot`
 * containing `encoder-*.onnx`, `decoder-*.onnx`, `joiner-*.onnx` and
 * `tokens.txt` (see scripts/download-sherpa-model.sh).
 */
export class SherpaOnnxSttProvider implements SpeechToTextProvider {
  readonly id: STTProvider = 'sherpa-onnx';
  readonly name = 'Sherpa-ONNX Streaming Zipformer';
  readonly requiresApiKey = false;
  readonly requiresNetwork = false;

  private readonly modelRoot: string;
  private readonly defaultModel: string;
  private readonly recognizers = new Map<string, OnlineRecognizer>();

  constructor(modelRoot: string, defaultModel = 'streaming-zipformer-en') {
    this.modelRoot = modelRoot;
    this.defaultModel = defaultModel;
  }

  modelDirFor(name?: string): string {
    const model = name && name.trim() ? name.trim() : this.defaultModel;
    return join(this.modelRoot, model);
  }

  async transcribe(audio: Uint8Array, options: TranscriptionOptions): Promise<Transcript> {
    const start = Date.now();
    const recognizer = this.getRecognizer(options.model);
    const stream = recognizer.createStream();

    // Int16 PCM → Float32 for sherpa-onnx.
    const int16 = new Int16Array(audio.buffer, audio.byteOffset, audio.byteLength / 2);
    const samples = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) samples[i] = int16[i] / 32768;

    const sampleRate = recognizer.config.featConfig.sampleRate ?? 16000;
    this.feedChunks(recognizer, stream, samples, sampleRate);

    // Trailing silence so a truncated utterance is flushed out.
    const silence = new Float32Array(1600); // 0.1s
    for (let i = 0; i < 6; i++) {
      stream.acceptWaveform({ samples: silence, sampleRate });
      while (recognizer.isReady(stream)) recognizer.decode(stream);
    }
    stream.inputFinished();
    while (recognizer.isReady(stream)) recognizer.decode(stream);

    const text = recognizer.getResult(stream).text.trim();
    return {
      text,
      language: options.language ?? 'en',
      latencyMs: Date.now() - start,
      provider: 'sherpa-onnx',
    };
  }

  async check(): Promise<{ ok: boolean; message: string }> {
    const available = await this.listModels();
    if (available.length === 0) {
      return {
        ok: false,
        message: `No Sherpa-ONNX models found in ${this.modelRoot}. Run ./scripts/download-sherpa-model.sh`,
      };
    }
    return { ok: true, message: `Sherpa-ONNX available (${available.join(', ')})` };
  }

  async listModels(): Promise<string[]> {
    try {
      return readdirSync(this.modelRoot).filter(name =>
        existsSync(join(this.modelRoot, name, 'tokens.txt')),
      );
    } catch {
      return [];
    }
  }

  private getRecognizer(model?: string): OnlineRecognizer {
    const key = (model && model.trim() ? model.trim() : this.defaultModel);
    let recognizer = this.recognizers.get(key);
    if (!recognizer) {
      const dir = this.modelDirFor(key);
      const config: OnlineRecognizerConfig = {
        featConfig: { sampleRate: 16000, featureDim: 80 },
        modelConfig: {
          transducer: {
            encoder: this.findFile(dir, /^encoder-.*\.onnx$/),
            decoder: this.findFile(dir, /^decoder-.*\.onnx$/),
            joiner: this.findFile(dir, /^joiner-.*\.onnx$/),
          },
          tokens: join(dir, 'tokens.txt'),
          numThreads: 2,
          provider: 'cpu',
        },
        decodingMethod: 'greedy_search',
        enableEndpoint: true,
      };
      const sherpa: typeof import('sherpa-onnx-node') = require('sherpa-onnx-node');
      recognizer = new sherpa.OnlineRecognizer(config);
      this.recognizers.set(key, recognizer);
    }
    return recognizer;
  }

  private findFile(dir: string, pattern: RegExp): string {
    if (!existsSync(dir)) {
      throw new Error(`Sherpa-ONNX model directory not found: ${dir}`);
    }
    const file = readdirSync(dir).find(name => pattern.test(name));
    if (!file) {
      throw new Error(`No model file matching ${pattern} in ${dir}`);
    }
    return join(dir, file);
  }

  private feedChunks(
    recognizer: OnlineRecognizer,
    stream: OnlineStream,
    samples: Float32Array,
    sampleRate: number,
  ): void {
    const chunkSize = 1600; // 0.1s.
    for (let i = 0; i < samples.length; i += chunkSize) {
      stream.acceptWaveform({ samples: samples.subarray(i, i + chunkSize), sampleRate });
      while (recognizer.isReady(stream)) recognizer.decode(stream);
    }
  }
}