import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchOpenAiLikeModels, fetchGeminiModels } from '../../packages/transcription/src/model-lists.js';

const FALLBACK = ['fallback-a', 'fallback-b'];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchOpenAiLikeModels', () => {
  it('returns the filtered, sorted catalog on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: 'whisper-large-v3-turbo' },
          { id: 'whisper-small' },
          { id: 'llama-3.1-8b-instant' },
        ],
      }),
    })) as any);

    const ids = await fetchOpenAiLikeModels('https://x', 'key', id => id.includes('whisper'), FALLBACK);
    expect(ids).toEqual(['whisper-large-v3-turbo', 'whisper-small']);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('https://x/models', {
      headers: { Authorization: 'Bearer key' },
    });
  });

  it('falls back when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }) as any);
    const ids = await fetchOpenAiLikeModels('https://x', 'key', () => true, FALLBACK);
    expect(ids).toEqual(FALLBACK);
  });

  it('falls back on an HTTP error or empty catalog', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })) as any);
    expect(await fetchOpenAiLikeModels('https://x', 'key', () => true, FALLBACK)).toEqual(FALLBACK);

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })) as any);
    expect(await fetchOpenAiLikeModels('https://x', 'key', () => true, FALLBACK)).toEqual(FALLBACK);
  });

  it('returns curated defaults when no key is present', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy as any);
    expect(await fetchOpenAiLikeModels('https://x', '', () => true, FALLBACK)).toEqual(FALLBACK);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('fetchGeminiModels', () => {
  it('strips the models/ prefix and excludes embeddings', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        models: [
          { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-2.0-flash' },
          { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['generateContent'] },
        ],
      }),
    })) as any);

    const ids = await fetchGeminiModels('key', FALLBACK);
    expect(ids).toEqual(['gemini-2.0-flash', 'gemini-2.5-flash']);
  });

  it('falls back on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })) as any);
    expect(await fetchGeminiModels('key', FALLBACK)).toEqual(FALLBACK);
  });

  it('returns curated defaults when no key is present', async () => {
    expect(await fetchGeminiModels('', FALLBACK)).toEqual(FALLBACK);
  });
});