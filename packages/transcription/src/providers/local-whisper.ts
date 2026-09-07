import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SpeechToTextProvider, TranscriptionOptions } from '../types.js';
import type { Transcript, STTProvider } from '@speakright/shared';

export const WHISPER_MODELS = ['base', 'small', 'medium', 'large'] as const;
export type WhisperModel = (typeof WHISPER_MODELS)[number];

/** Map a whisper.cpp model name to its ggml file name (English-only variants). */
export function whisperModelFileName(model: string): string {
  const base = WHISPER_MODELS.includes(model as WhisperModel) ? model : 'base';
  return `ggml-${base}.en.bin`;
}

/**
 * Local whisper.cpp adapter.
 *
 * Strategy: write incoming PCM data to a temporary WAV file,
 * invoke `whisper-cli -f temp.wav --model /path/to/model`, parse stdout.
 *
 * The model is selected at transcribe-time from `options.model`
 * (one of `base`, `small`, `medium`, `large`); the caller should
 * pre-resample audio to 16kHz mono before passing in.
 */
export class LocalWhisperProvider implements SpeechToTextProvider {
  readonly id: STTProvider = 'local-whisper';
  readonly name = 'Local Whisper (whisper.cpp)';
  readonly requiresApiKey = false;
  readonly requiresNetwork = false;

  private readonly whisperBin: string;
  private readonly modelDir: string;
  private readonly defaultModel: string;

  constructor(whisperBinPath: string, modelDir: string, defaultModel = 'base') {
    this.whisperBin = whisperBinPath;
    this.modelDir = modelDir;
    this.defaultModel = defaultModel;
  }

  modelPathFor(name?: string): string {
    const model = name && name.trim() ? name.trim() : this.defaultModel;
    return join(this.modelDir, whisperModelFileName(model));
  }

  async transcribe(audio: Uint8Array, options: TranscriptionOptions): Promise<Transcript> {
    const tmpWav = this.writeTempWav(audio);
    try {
      return await this.runWhisper(tmpWav, options, this.modelPathFor(options.model));
    } finally {
      try { unlinkSync(tmpWav); } catch { /* ignore */ }
    }
  }

  async check(): Promise<{ ok: boolean; message: string }> {
    if (!existsSync(this.whisperBin)) {
      return { ok: false, message: `whisper.cpp binary not found at: ${this.whisperBin}` };
    }
    const available = await this.listModels();
    if (available.length === 0) {
      return {
        ok: false,
        message: `No whisper.cpp models found in ${this.modelDir}. Run ./scripts/download-whisper-model.sh base|small|medium`,
      };
    }
    return { ok: true, message: `whisper.cpp available (${available.join(', ')})` };
  }

  async listModels(): Promise<string[]> {
    try {
      const files = readdirSync(this.modelDir);
      const installed = WHISPER_MODELS.filter(m =>
        files.includes(whisperModelFileName(m)),
      );
      // Any other ggml-*.bin present also counts as usable.
      const extra = files
        .filter(f => f.startsWith('ggml-') && f.endsWith('.bin'))
        .map(f => f.replace(/^ggml-(.+)\.en\.bin$/, '$1').replace(/^ggml-(.+)\.bin$/, '$1'))
        .filter(name => !installed.includes(name as WhisperModel));
      return [...installed, ...extra];
    } catch {
      return [];
    }
  }

  private writeTempWav(pcmInt16: Uint8Array): string {
    const sampleRate = 16000;
    const channels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);
    const dataSize = pcmInt16.length;
    const headerSize = 44;
    const buffer = Buffer.alloc(headerSize + dataSize);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);           // sub-chunk size
    buffer.writeUInt16LE(1, 20);            // PCM format
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    buffer.set(pcmInt16, 44);

    const tmpFile = join(tmpdir(), `speakright_whisper_${Date.now()}.wav`);
    writeFileSync(tmpFile, buffer);
    return tmpFile;
  }

  private runWhisper(wavPath: string, options: TranscriptionOptions, modelPath: string): Promise<Transcript> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const args = [
        '-f', wavPath,
        '--model', modelPath,
        '--language', options.language ?? 'en',
        '--output-txt',
        '--no-prints',
        '--no-timestamps',
        '-t', '4',
      ];

      const proc = spawn(this.whisperBin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      proc.on('close', (code: number | null) => {
        if (code !== 0) {
          reject(new Error(`whisper.cpp exited with code ${code}: ${stderr}`));
          return;
        }
        const text = stdout.trim();
        const latencyMs = Date.now() - start;
        resolve({
          text,
          language: options.language ?? 'en',
          latencyMs,
          provider: 'local-whisper',
        });
      });

      proc.on('error', reject);
    });
  }
}