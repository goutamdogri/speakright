import { describe, it, expect, vi, afterEach } from 'vitest';

import { PipelineController } from '../../apps/desktop/src/main/pipeline-controller.js';
import { PipelineWorker } from '../../apps/desktop/src/main/pipeline-worker.js';
import { SettingsManager } from '@speakright/settings';

function makeSettings(): SettingsManager {
  const repo = { get: (_k: string) => null as string | null, set: (_k: string, _v: string) => {} };
  return new SettingsManager(repo as any);
}

function makeStubRepo(): any {
  return { startSession: vi.fn(), endSession: vi.fn(), insert: vi.fn() };
}

async function buildController(): Promise<PipelineController> {
  const settings = makeSettings();
  const sessionRepo = makeStubRepo();
  const utteranceRepo = makeStubRepo();
  const correctionRepo = makeStubRepo();
  const audioHost = { start: vi.fn(), stop: vi.fn(), setDevice: vi.fn(), isActive: () => false, destroy: vi.fn() };

  return new PipelineController({
    settings,
    sessionRepo,
    utteranceRepo,
    correctionRepo,
    audioHost: audioHost as any,
    onCorrection: () => {},
    onLiveEvent: () => {},
  });
}

/**
 * Regression test for the "401 Invalid API Key" bug: providers capture their API
 * key at construction, so a runtime key update must rebuild the registered
 * provider instances. Previously updateProviders() only merged config and called
 * setActive(), leaving the old (empty-key) provider active during transcription.
 */
describe('PipelineWorker API-key propagation (issue: 401 on transcribe)', () => {
  it('rebuilds registered cloud providers when keys change', async () => {
    const controller = await buildController();
    const worker = (controller as any).worker;

    const before = worker.sttRouter.getProvider('groq');
    expect(before).toBeTruthy();
    expect((before as any).apiKey).toBe('');

    worker.updateProviders({ groqApiKey: 'sk-test-123' });

    const after = worker.sttRouter.getProvider('groq');
    expect(after).toBeTruthy();
    // A NEW instance is registered, not the stale empty-key one...
    expect(after).not.toBe(before);
    // ...and it carries the freshly-provided key.
    expect((after as any).apiKey).toBe('sk-test-123');
  });

  it('also rebuilds the LLM routers on key updates', async () => {
    const controller = await buildController();
    const worker = (controller as any).worker;

    const before = worker.llmRouter.getProvider('openai');
    expect((before as any).apiKey).toBe('');

    worker.updateProviders({ openaiApiKey: 'sk-test-openai' });

    const after = worker.llmRouter.getProvider('openai');
    expect(after).not.toBe(before);
    expect((after as any).apiKey).toBe('sk-test-openai');
  });
});

/**
 * Regression test for the Groq 404: a persisted model id that the provider
 * retired (llama-3.3-70b-versatile) must auto-switch to a current model from
 * the live catalog instead of being sent to the API.
 */
describe('PipelineWorker model self-heal (issue: stale Groq model 404)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('replaces a retired cloud model with the preferred current one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: 'qwen/qwen3.6-27b' },
          { id: 'openai/gpt-oss-120b' },
          { id: 'groq/compound-mini' },
        ],
      }),
    })) as any);

    const worker = new PipelineWorker({
      sttProvider: 'local-whisper',
      sttModel: 'base',
      llmProvider: 'ollama',
      llmModel: 'llama3.1',
      groqApiKey: 'sk-test',
    });

    // Switch Groq as the LLM provider with a model Groq no longer serves.
    worker.updateProviders({ llmProvider: 'groq', llmModel: 'llama-3.3-70b-versatile' });

    await vi.waitFor(() => {
      const config = (worker as any).config as { llmModel: string };
      expect(config.llmModel).toBe('qwen/qwen3.6-27b');
    });

    // The registered provider now captures the valid model.
    const provider = (worker as any).llmRouter.getProvider('groq');
    expect((provider as any).defaultModel).toBe('qwen/qwen3.6-27b');
  });

  it('leaves a valid model untouched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [{ id: 'qwen/qwen3.6-27b' }, { id: 'openai/gpt-oss-120b' }],
      }),
    })) as any);

    const worker = new PipelineWorker({
      sttProvider: 'local-whisper',
      sttModel: 'base',
      llmProvider: 'ollama',
      llmModel: 'llama3.1',
      groqApiKey: 'sk-test',
    });

    worker.updateProviders({ llmProvider: 'groq', llmModel: 'openai/gpt-oss-120b' });

    await new Promise(r => setTimeout(r, 30));
    expect((worker as any).config.llmModel).toBe('openai/gpt-oss-120b');
  });
});