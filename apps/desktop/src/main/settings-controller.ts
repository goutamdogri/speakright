import type { AppSettings } from '@speakright/shared';
import type { SettingsManager } from '@speakright/settings';

/**
 * Thin wrapper for settings CRUD exposed via IPC.
 */
export class SettingsController {
  constructor(private settings: SettingsManager) {}

  getAll(): AppSettings {
    return this.settings.getAll();
  }

  update(patch: Partial<AppSettings>): AppSettings {
    return this.settings.update(patch);
  }

  reset(): AppSettings {
    return this.settings.reset();
  }
}
