import type { DisplayCorrection, Severity } from '@speakright/shared';
import type { CorrectionQueueCallbacks, CorrectionQueueOptions, QueueState } from './types.js';

const DEFAULT_OPTIONS: CorrectionQueueOptions = {
  maxItems: 20,
  displayDurationMs: 10_000,
  confidenceThreshold: 0.5,
};

/**
 * FIFO correction queue with display scheduling.
 *
 * Responsibilities:
 * 1. Maintain an ordered FIFO of corrections (by sequence number).
 * 2. Show exactly one item at a time for a minimum display duration.
 * 3. Overflow policy: when max size is reached, drop lowest confidence first.
 * 4. Support pause, skip, and resume.
 */
export class CorrectionQueue {
  private readonly items: DisplayCorrection[] = [];
  private readonly options: CorrectionQueueOptions;
  private readonly callbacks: CorrectionQueueCallbacks;
  private state: QueueState = 'empty';
  private displayTimer: ReturnType<typeof setTimeout> | null = null;
  private sequenceCounter = 0;
  private currentDisplay: DisplayCorrection | null = null;

  constructor(options: Partial<CorrectionQueueOptions> = {}, callbacks: CorrectionQueueCallbacks) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.callbacks = callbacks;
  }

  get queueLength(): number {
    return this.items.length;
  }

  getState(): QueueState {
    return this.state;
  }

  /** The correction currently shown on the overlay, if any. */
  get currentlyDisplayed(): DisplayCorrection | null {
    return this.currentDisplay;
  }

  /**
   * Enqueue a new correction result.
   * If the display is empty, show it immediately.
   * If the queue is full, apply overflow policy.
   *
   * `maxItems` caps the TOTAL number of corrections in flight (the one
   * currently displayed plus everything queued behind it).
   */
  enqueue(item: DisplayCorrection): void {
    item.sequenceNo = this.sequenceCounter++;

    const displayActive = this.state === 'showing';
    const queuedCapacity = displayActive ? this.options.maxItems - 1 : this.options.maxItems;

    if (this.items.length >= queuedCapacity) {
      this.handleOverflow(item, queuedCapacity);
      return;
    }

    this.items.push(item);

    if (this.state === 'empty' && this.displayTimer === null) {
      this.showNext();
    }
  }

  /**
   * Skip the currently displayed item without deleting it from history.
   * Immediately advances to the next item or shows empty.
   */
  skip(): void {
    if (this.displayTimer !== null) {
      clearTimeout(this.displayTimer);
      this.displayTimer = null;
    }
    this.showNext();
  }

  /**
   * Pause display progression. Items still queue but nothing advances.
   * Items in queue remain.
   */
  pause(): void {
    this.state = 'paused';
    if (this.displayTimer !== null) {
      clearTimeout(this.displayTimer);
      this.displayTimer = null;
    }
  }

  resume(): void {
    if (this.items.length === 0) {
      this.state = 'empty';
      return;
    }
    this.state = 'showing';
    this.showNext();
  }

  /**
   * Force removal of an item by ID (from history, keeps display going).
   */
  removeById(id: string): void {
    const idx = this.items.findIndex(i => i.id === id);
    if (idx >= 0) this.items.splice(idx, 1);
  }

  peekHead(): DisplayCorrection | undefined {
    return this.items[0];
  }

  dispose(): void {
    if (this.displayTimer !== null) {
      clearTimeout(this.displayTimer);
      this.displayTimer = null;
    }
  }

  private showNext(): void {
    if (this.items.length === 0) {
      this.state = 'empty';
      this.displayTimer = null;
      this.currentDisplay = null;
      this.callbacks.onEmpty();
      return;
    }

    const item = this.items.shift()!;
    this.currentDisplay = item;
    this.state = 'showing';
    this.callbacks.onShow(item);

    this.displayTimer = setTimeout(() => {
      this.displayTimer = null;
      this.showNext();
    }, this.options.displayDurationMs);
  }

  private handleOverflow(newItem: DisplayCorrection, capacity: number): void {
    // Drop the lowest-confidence item that is NOT currently being displayed
    const currentDisplay = this.currentDisplay;
    const insertIndex = this.findInsertionIndex(newItem);

    // If queue is full, evict lowest-confidence item when the new one is better
    if (this.items.length >= capacity) {
      let lowestIdx = -1;
      let lowestConf = Infinity;
      let lowestSeverity: Severity = 'low';

      for (let i = 0; i < this.items.length; i++) {
        const existing = this.items[i];
        if (currentDisplay && existing.id === currentDisplay.id) continue;

        if (
          existing.confidence < lowestConf ||
          (existing.confidence === lowestConf && this.severityOrder(existing.severity) < this.severityOrder(lowestSeverity))
        ) {
          lowestConf = existing.confidence;
          lowestSeverity = existing.severity;
          lowestIdx = i;
        }
      }

      if (lowestIdx >= 0 && this.items[lowestIdx].confidence < newItem.confidence) {
        this.items.splice(lowestIdx, 1);
        this.items.splice(Math.min(insertIndex, this.items.length), 0, newItem);
      }
      // else: drop the new item as it's not better than anything in queue
    } else {
      this.items.splice(Math.min(insertIndex, this.items.length), 0, newItem);
    }
  }

  private findInsertionIndex(item: DisplayCorrection): number {
    for (let i = 0; i < this.items.length; i++) {
      if (item.sequenceNo < this.items[i].sequenceNo) return i;
    }
    return this.items.length;
  }

  private severityOrder(s: Severity): number {
    return s === 'high' ? 2 : s === 'medium' ? 1 : 0;
  }
}
