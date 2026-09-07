import type { AppSettings } from '@speakright/shared';
import type { SettingsRepository } from '@speakright/database';
import { DEFAULT_SETTINGS } from './defaults.js';

/**
 * Manages application settings, persisting to SQLite.
 *
 * Settings are stored as a single JSON payload under the "app" key in the
 * `settings` table, which keeps round-tripping simple and extensible.
 */
export class SettingsManager {
  private settings: AppSettings;
  private readonly repo: SettingsRepository;

  constructor(repo: SettingsRepository) {
    this.repo = repo;
    this.settings = this.load();
  }

  /** Returns a deep copy of all settings. */
  getAll(): AppSettings {
    return structuredClone(this.settings);
  }

  /** Returns a deep copy of one section. */
  getSection<K extends keyof AppSettings>(section: K): AppSettings[K] {
    return structuredClone(this.settings[section]);
  }

  /** Applies a shallow-or-nested patch to the full settings tree. */
  update(patch: Partial<AppSettings>): AppSettings {
    this.settings = this.deepMerge(this.settings, patch);
    this.persist();
    return this.getAll();
  }

  /** Updates a single section (e.g. overlay, audio). */
  updateSection<K extends keyof AppSettings>(
    section: K,
    patch: Partial<AppSettings[K]>,
  ): AppSettings[K] {
    this.settings[section] = this.deepMerge(this.settings[section] as any, patch as any) as AppSettings[K];
    this.persist();
    return this.getSection(section);
  }

  reset(): AppSettings {
    this.settings = structuredClone(DEFAULT_SETTINGS);
    this.persist();
    return this.getAll();
  }

  private load(): AppSettings {
    const raw = this.repo.get('app');
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    try {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return this.deepMerge(structuredClone(DEFAULT_SETTINGS), parsed);
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }

  private persist(): void {
    this.repo.set('app', JSON.stringify(this.settings));
  }

  private deepMerge<T>(base: T, patch: unknown): T {
    const result = structuredClone(base);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return (patch as T) ?? result;
    }

    const patchObj = patch as Record<string, unknown>;
    for (const key of Object.keys(patchObj)) {
      const existing = (result as Record<string, unknown>)[key];
      const incoming = patchObj[key];
      if (
        incoming &&
        typeof incoming === 'object' &&
        !Array.isArray(incoming) &&
        existing &&
        typeof existing === 'object' &&
        !Array.isArray(existing)
      ) {
        (result as Record<string, unknown>)[key] = this.deepMerge(existing, incoming);
      } else {
        (result as Record<string, unknown>)[key] = incoming;
      }
    }
    return result;
  }
}
