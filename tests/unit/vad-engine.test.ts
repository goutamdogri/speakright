import { describe, it, expect } from 'vitest';
import { EnergyBasedVad, DEFAULT_VAD_OPTIONS } from '@speakright/audio';

describe('EnergyBasedVad', () => {
  it('does not fire on silence', () => {
    let uttered = false;
    const vad = new EnergyBasedVad(
      { sampleRate: 16000, vadSensitivity: 0.01, silenceDurationMs: 700 },
      {
        onSpeechStart: () => {},
        onSpeechEnd: () => {},
        onUtterance: () => { uttered = true; },
        onMaxDurationReached: () => {},
      },
    );

    // 2 seconds of silence
    const silence = new Float32Array(32000);
    for (let i = 0; i < 32; i++) {
      vad.process(silence.subarray(i * 1000, (i + 1) * 1000), i * 1000);
    }

    expect(uttered).toBe(false);
  });

  it('detects a speech burst and produces an utterance', () => {
    const utterances: { frames: Float32Array; startMs: number; endMs: number }[] = [];
    const vad = new EnergyBasedVad(
      { sampleRate: 16000, vadSensitivity: 0.01, silenceDurationMs: 700, minSpeechMs: 100 },
      {
        onSpeechStart: () => {},
        onSpeechEnd: () => {},
        onUtterance: (frames, startMs, endMs) => utterances.push({ frames, startMs, endMs }),
        onMaxDurationReached: () => {},
      },
    );

    // 300ms silence, 500ms speech, 1000ms silence
    const silence = new Float32Array(8000);
    const speech = new Float32Array(8000).fill(0.3);
    const trailingSilence = new Float32Array(16000);

    vad.process(silence, 0);
    vad.process(speech, 8000);
    vad.process(trailingSilence, 16000);

    expect(utterances.length).toBe(1);
    expect(utterances[0].frames.length).toBeGreaterThan(1000);
  });

  it('respects the configured silence duration', () => {
    const utterances: number[] = [];
    const vad = new EnergyBasedVad(
      { sampleRate: 16000, vadSensitivity: 0.01, silenceDurationMs: 300 },
      {
        onSpeechStart: () => {},
        onSpeechEnd: () => {},
        onUtterance: (_, start, end) => utterances.push(end),
        onMaxDurationReached: () => {},
      },
    );

    const speech = new Float32Array(4000).fill(0.3);
    const shortSilence = new Float32Array(4000); // 250ms < 300ms threshold
    const moreSpeech = new Float32Array(4000).fill(0.3);
    const longSilence = new Float32Array(8000); // 500ms > 300ms threshold

    vad.process(speech, 0);
    vad.process(shortSilence, 4000);
    vad.process(moreSpeech, 8000);
    vad.process(longSilence, 12000);

    // Should outcome one utterance (or two if the 250ms silence counted).
    // With 300ms threshold and 250ms of silence, speech continues → 1 utterance.
    expect(utterances.length).toBe(1);
  });
});