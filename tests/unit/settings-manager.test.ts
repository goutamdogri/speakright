import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsManager } from '@speakright/settings';
import { DEFAULT_SETTINGS } from '@speakright/settings';

function createMockRepo() {
  const store = new Map<string, string>();
  return {
    get: vi.fn((key: string) => store.get(key) ?? null),
    set: vi.fn((key: string, value: string) => store.set(key, value)),
    getAll: vi.fn(() => Object.fromEntries(store)),
    delete: vi.fn((key: string) => store.delete(key)),
  };
}

describe('SettingsManager', () => {
  it('returns defaults when nothing is persisted', () => {
    const repo = createMockRepo();
    const mgr = new SettingsManager(repo as any);

    expect(mgr.getAll()).toEqual(DEFAULT_SETTINGS);
  });

  it('updates a single section without clobbering others', () => {
    const repo = createMockRepo();
    const mgr = new SettingsManager(repo as any);

    const updated = mgr.updateSection('overlay', { displayDurationMs: 5000 });
    expect(updated.displayDurationMs).toBe(5000);
    expect(mgr.getSection('audio').vadSensitivity).toBe(DEFAULT_SETTINGS.audio.vadSensitivity);
  });

  it('persists and re-loads settings', () => {
    const repo = createMockRepo();
    const mgr = new SettingsManager(repo as any);
    mgr.updateSection('overlay', { opacity: 0.7 });

    const reloaded = new SettingsManager(repo as any);
    expect(reloaded.getSection('overlay').opacity).toBe(0.7);
  });

  it('deep-merges nested patches', () => {
    const repo = createMockRepo();
    const mgr = new SettingsManager(repo as any);

    mgr.update({ provider: { llmModel: 'gemma2' } });
    expect(mgr.getSection('provider').llmModel).toBe('gemma2');
    expect(mgr.getSection('provider').stt).toBe(DEFAULT_SETTINGS.provider.stt);
  });

  it('falls back to defaults on corrupted stored JSON', () => {
    const repo = createMockRepo();
    repo.set('app', '{invalid json');

    const mgr = new SettingsManager(repo as any);
    expect(mgr.getAll()).toEqual(DEFAULT_SETTINGS);
  });
});