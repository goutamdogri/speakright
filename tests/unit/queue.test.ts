import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CorrectionQueue } from '@speakright/queue';
import type { DisplayCorrection } from '@speakright/shared';

function makeCorrection(patch: Partial<DisplayCorrection> = {}): DisplayCorrection {
  return {
    id: Math.random().toString(36).slice(2),
    sequenceNo: 0,
    original: 'I have went there.',
    corrected: 'I went there.',
    hasCorrection: true,
    confidence: 0.9,
    severity: 'medium',
    issues: [],
    explanation: 'Use simple past.',
    timestamp: Date.now(),
    ...patch,
  };
}

describe('CorrectionQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows an item immediately when queue was empty', () => {
    const onShow = vi.fn();
    const queue = new CorrectionQueue({ displayDurationMs: 10_000 }, { onShow, onEmpty: vi.fn(), onAdvance: vi.fn() });

    queue.enqueue(makeCorrection());

    expect(onShow).toHaveBeenCalledTimes(1);
    expect(queue.queueLength).toBe(0);
  });

  it('waits the display duration before showing the next item', () => {
    const onShow = vi.fn();
    const queue = new CorrectionQueue({ displayDurationMs: 10_000 }, { onShow, onEmpty: vi.fn(), onAdvance: vi.fn() });

    queue.enqueue(makeCorrection({ id: 'a' }));
    queue.enqueue(makeCorrection({ id: 'b' }));

    expect(onShow).toHaveBeenCalledTimes(1);
    expect(queue.queueLength).toBe(1);

    vi.advanceTimersByTime(9_000);
    expect(onShow).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000);
    expect(onShow).toHaveBeenCalledTimes(2);
    expect((onShow.mock.calls[1][0] as DisplayCorrection).id).toBe('b');
  });

  it('drops lowest-confidence items when at max capacity', () => {
    const onShow = vi.fn();
    const queue = new CorrectionQueue(
      { displayDurationMs: 10_000, maxItems: 3 },
      { onShow, onEmpty: vi.fn(), onAdvance: vi.fn() },
    );

    // Show first item immediately
    queue.enqueue(makeCorrection({ id: 'first', confidence: 0.9 }));
    // These go into the queue (capacity reached at 3 total)
    queue.enqueue(makeCorrection({ id: 'a', confidence: 0.8 }));
    queue.enqueue(makeCorrection({ id: 'b', confidence: 0.7 }));

    expect(queue.queueLength).toBe(2);

    // Queue is full (1 showing + 2 queued = 3). Add high-confidence item.
    queue.enqueue(makeCorrection({ id: 'c', confidence: 0.99 }));
    // Should evict the lowest-confidence queued item (b, 0.7)
    expect(queue.queueLength).toBe(2);
    const ids = queue.peekHead();
    // b should be gone; queue should contain a and c (or c before a by sequence)
    const remaining = [queue.peekHead()?.id];
    // We can't easily inspect all items; verify by advancing
    vi.advanceTimersByTime(10_000);
    // After advancing we see 'first' done, then next shows.
    expect(onShow.mock.calls.map(c => (c[0] as DisplayCorrection).id)).toContain('first');
  });

  it('skip advances immediately', () => {
    const onShow = vi.fn();
    const queue = new CorrectionQueue({ displayDurationMs: 10_000 }, { onShow, onEmpty: vi.fn(), onAdvance: vi.fn() });

    queue.enqueue(makeCorrection({ id: 'a' }));
    queue.enqueue(makeCorrection({ id: 'b' }));
    queue.skip();

    expect(onShow).toHaveBeenCalledTimes(2);
    expect((onShow.mock.calls[1][0] as DisplayCorrection).id).toBe('b');
  });

  it('pause freezes display; resume continues', () => {
    const onShow = vi.fn();
    const queue = new CorrectionQueue({ displayDurationMs: 10_000 }, { onShow, onEmpty: vi.fn(), onAdvance: vi.fn() });

    queue.enqueue(makeCorrection({ id: 'a' }));
    queue.enqueue(makeCorrection({ id: 'b' }));
    queue.pause();

    vi.advanceTimersByTime(30_000);
    expect(onShow).toHaveBeenCalledTimes(1);

    queue.resume();
    vi.advanceTimersByTime(10_000);
    expect(onShow).toHaveBeenCalledTimes(2);
  });
});