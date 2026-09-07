import type { CorrectionRepository } from '@speakright/database';
import type { HistoryEntry, HistoryFilter } from '@speakright/database';

/**
 * History queries for the settings/renderer UI.
 */
export class HistoryController {
  constructor(private repo: CorrectionRepository) {}

  async get(filter: HistoryFilter = {}): Promise<HistoryEntry[]> {
    return this.repo.getHistory(filter);
  }

  async deleteItem(id: string): Promise<void> {
    this.repo.deleteItem(id);
  }

  async clear(): Promise<void> {
    this.repo.clearAll();
  }
}
