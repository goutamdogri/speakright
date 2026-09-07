import type { DisplayCorrection } from '@speakright/shared';

export type QueueState = 'empty' | 'showing' | 'waiting' | 'paused';

export interface CorrectionQueueCallbacks {
  onShow: (item: DisplayCorrection) => void;
  onAdvance: (nextItem: DisplayCorrection | null) => void;
  onEmpty: () => void;
}

export interface CorrectionQueueOptions {
  maxItems: number;
  displayDurationMs: number;
  /** Drop items below this confidence level when queue overflows. */
  confidenceThreshold: number;
}
