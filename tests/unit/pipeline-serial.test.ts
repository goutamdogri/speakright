import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PipelineController } from '../../apps/desktop/src/main/pipeline-controller.js';
import { SettingsManager } from '@speakright/settings';

function makeSettings(): SettingsManager {
  const repo = { get: (_k: string) => null as string | null, set: (_k: string, _v: string) => {} };
  return new SettingsManager(repo as any);
}

function makeStubRepo(): any {
  return {
    startSession: vi.fn(),
    endSession: vi.fn(),
    insert: vi.fn(),
  };
}

interface Ctx {
  controller: PipelineController;
  onShow: ReturnType<typeof vi.fn>;
  live: any[];
  stats: { maxConcurrency: number };
}

function utterance(id: string): any {
  // Distinct marker so each utterance is identifiable in a delay map.
  const n = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const samples = new Float32Array(1600).fill(n > 0 ? 0.001 * (n % 100) : 0.001);
  return {
    samples,
    sampleRate: 16000,
    startTime: 0,
    endTime: 1000,
    durationMs: 1000,
  };
}

/**
 * Builds a PipelineController with a fake worker that records concurrency and
 * applies per-id latency, so we can verify serial ordering and no overlapping
 * STT runs (issue #2) plus overlay updates after a stop→start cycle (issue #1).
 */
async function buildController(): Promise<Ctx> {
  const settings = makeSettings();
  const sessionRepo = makeStubRepo();
  const utteranceRepo = makeStubRepo();
  const correctionRepo = makeStubRepo();
  const audioHost = { start: vi.fn(), stop: vi.fn(), setDevice: vi.fn(), isActive: () => false, destroy: vi.fn() };

  const onShow = vi.fn();
  const live: any[] = [];
  const delayById = new Map<string, number>();
  const callIds: string[] = [];
  const stats = { maxConcurrency: 0 };
  let active = 0;

  const controller = new PipelineController({
    settings,
    sessionRepo,
    utteranceRepo,
    correctionRepo,
    audioHost: audioHost as any,
    onCorrection: item => onShow(item),
    onLiveEvent: e => live.push(e),
  });

  (controller as any).worker.transcribe = vi.fn(async () => {
    const id = callIds.shift() ?? '????';
    const delay = delayById.get(id) ?? 10;
    active++;
    stats.maxConcurrency = Math.max(stats.maxConcurrency, active);
    await new Promise(r => setTimeout(r, delay));
    active--;
    return { text: id, language: 'en', latencyMs: delay, provider: 'local-whisper' };
  });

  (controller as any).worker.correct = vi.fn(async (input: { transcript: string }) => {
    const delay = delayById.get(input.transcript) ?? 10;
    await new Promise(r => setTimeout(r, delay));
    return {
      original: input.transcript,
      corrected: input.transcript,
      has_correction: false,
      confidence: 1,
      severity: 'low',
      issues: [],
    };
  });

  return { controller, onShow, live, stats, callIds, delayById } as Ctx & any;
}

describe('PipelineController serial processing (issue #2)', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('processes utterances strictly one at a time, in order', async () => {
    const { controller, callIds, delayById, live, stats } = await buildController() as any;
    controller.startListening();

    delayById.set('aaaa', 40);
    delayById.set('bbbb', 1);
    delayById.set('cccc', 1);
    callIds.push('aaaa', 'bbbb', 'cccc');

    controller.handleUtterance(utterance('aaaa'));
    controller.handleUtterance(utterance('bbbb'));
    controller.handleUtterance(utterance('cccc'));

    await new Promise(r => setTimeout(r, 250));

    const transcripts = live
      .filter((e: any) => e.kind === 'transcript')
      .map((e: any) => e.text);
    expect(transcripts).toEqual(['aaaa', 'bbbb', 'cccc']);
    // No two STT runs overlapped — the full pipeline is serial per chunk.
    expect(stats.maxConcurrency).toBe(1);
  });

  it('drops pending chunks after stopListening', async () => {
    const { controller, callIds, delayById, live } = await buildController() as any;
    controller.startListening();

    // 'aaaa' is in-flight (long); 'cccc' is still pending when we stop.
    delayById.set('aaaa', 50);
    delayById.set('bbbb', 1);
    callIds.push('aaaa', 'cccc');
    controller.handleUtterance(utterance('aaaa'));
    controller.handleUtterance(utterance('cccc'));
    await new Promise(r => setTimeout(r, 10));
    controller.stopListening();

    // Restart; the pending 'cccc' was dropped, only new chunks process.
    // Mirror that in the harness: its call-ids no longer include 'cccc'.
    callIds.length = 0;
    controller.startListening();
    callIds.push('bbbb');
    controller.handleUtterance(utterance('bbbb'));

    await new Promise(r => setTimeout(r, 200));

    const transcripts = live
      .filter((e: any) => e.kind === 'transcript')
      .map((e: any) => e.text);
    expect(transcripts).toEqual(['aaaa', 'bbbb']);
  });

  it('displays a correction after a stop→start cycle (issue #1)', async () => {
    const { controller, callIds, delayById, onShow } = await buildController() as any;
    controller.startListening();

    delayById.set('aaaa', 1);
    callIds.push('aaaa');
    controller.handleUtterance(utterance('aaaa'));
    await new Promise(r => setTimeout(r, 30));
    controller.stopListening();

    controller.startListening();
    delayById.set('bbbb', 1);
    callIds.push('bbbb');
    (controller as any).worker.correct = async (input: { transcript: string }) => ({
      original: input.transcript,
      corrected: input.transcript,
      has_correction: true,
      confidence: 0.95,
      severity: 'medium',
      issues: [],
    });
    controller.handleUtterance(utterance('bbbb'));
    await new Promise(r => setTimeout(r, 50));

    expect(onShow).toHaveBeenCalled();
  });
});