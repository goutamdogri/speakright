import type { CapturedAudioFrame } from './types.js';

/**
 * Circular buffer that accumulates PCM samples during speech.
 *
 * On speech start we begin recording. On speech end we finalize the
 * buffer into a complete utterance chunk for STT processing.
 */
export class CircularAudioBuffer {
  private buffer: Float32Array;
  private writeIndex = 0;
  private totalWritten = 0;

  constructor(maxSamples: number) {
    this.buffer = new Float32Array(maxSamples);
  }

  /** Maximum capacity in samples */
  get capacity(): number {
    return this.buffer.length;
  }

  /** Number of samples currently held (subject to capacity) */
  get size(): number {
    return Math.min(this.totalWritten, this.buffer.length);
  }

  get isFull(): boolean {
    return this.totalWritten >= this.buffer.length;
  }

  clear(): void {
    this.writeIndex = 0;
    this.totalWritten = 0;
    this.buffer.fill(0);
  }

  write(samples: Float32Array): void {
    let sourceOffset = 0;
    let remaining = samples.length;

    const targetTotal = this.totalWritten + samples.length;

    while (remaining > 0) {
      const spaceToEnd = this.buffer.length - this.writeIndex;
      const toCopy = Math.min(spaceToEnd, remaining);

      this.buffer.set(samples.subarray(sourceOffset, sourceOffset + toCopy), this.writeIndex);

      sourceOffset += toCopy;
      this.writeIndex = (this.writeIndex + toCopy) % this.buffer.length;
      remaining -= toCopy;
    }

    this.totalWritten = targetTotal;
  }

  /**
   * Returns a copy of the buffered samples, oldest first.
   * If the buffer filled and wrapped, oldest samples were overwritten,
   * so we only return what represents the tail of the captured speech.
   */
  snapshot(): Float32Array {
    if (this.totalWritten === 0) return new Float32Array(0);

    const size = this.size;
    const result = new Float32Array(size);

    if (this.totalWritten <= this.buffer.length) {
      result.set(this.buffer.subarray(0, size));
    } else {
      const tail = this.totalWritten % this.buffer.length;

      if (tail === 0) {
        result.set(this.buffer);
      } else {
        const wrapped = this.buffer.subarray(tail);
        const head = this.buffer.subarray(0, tail);
        result.set(wrapped, 0);
        result.set(head, wrapped.length);
      }
    }

    return result;
  }

  /**
   * Resample a Float32Array to a target sample rate using linear
   * interpolation. Used to normalize captured audio to the STT
   * provider's expected format (typically 16kHz).
   */
  static resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate || samples.length === 0) return samples;

    const ratio = toRate / fromRate;
    const newLength = Math.floor(samples.length * ratio);

    if (newLength === 0) return new Float32Array(0);

    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const srcPos = i / ratio;
      const srcIndex = Math.floor(srcPos);
      const srcNext = Math.min(srcIndex + 1, samples.length - 1);
      const frac = srcPos - srcIndex;

      result[i] = samples[srcIndex] * (1 - frac) + samples[srcNext] * frac;
    }

    return result;
  }

  /** Convert Float32 PCM samples to Int16 PCM bytes (WAV-compatible). */
  static toInt16(samples: Float32Array): Int16Array {
    const out = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  static toFrame(samples: Float32Array, sampleRate: number, timestamp: number): CapturedAudioFrame {
    return { samples, sampleRate, timestamp };
  }
}
