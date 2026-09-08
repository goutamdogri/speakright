import { describe, it, expect } from 'vitest';
import {
  EnvSecretStore,
  MemorySecretStore,
  SecretManager,
  maskSecret,
} from '@speakright/secrets';
import type { CloudProvider } from '@speakright/shared';

describe('EnvSecretStore', () => {
  it('reads SPEAKRIGHT_<PROVIDER>_API_KEY and trims it', () => {
    const env = {
      SPEAKRIGHT_GROQ_API_KEY: '  gsk_abc123  ',
      SPEAKRIGHT_OPENAI_API_KEY: 'sk-openai',
      SPEAKRIGHT_GEMINI_API_KEY: '',
    } as NodeJS.ProcessEnv;

    const store = new EnvSecretStore(env);
    expect(store.get('groq')).toBe('gsk_abc123');
    expect(store.get('openai')).toBe('sk-openai');
    expect(store.get('gemini')).toBeNull();
    expect(store.has('groq')).toBe(true);
    expect(store.has('gemini')).toBe(false);
  });

  it('is read-only at runtime', () => {
    const store = new EnvSecretStore({} as NodeJS.ProcessEnv);
    store.set('groq', 'nope');
    store.clear('groq');
    expect(store.get('groq')).toBeNull();
  });
});

describe('MemorySecretStore', () => {
  it('stores, clears and reports', () => {
    const store = new MemorySecretStore();
    store.set('groq', 'key1');
    expect(store.has('groq')).toBe(true);
    expect(store.get('groq')).toBe('key1');
    store.clear('groq');
    expect(store.has('groq')).toBe(false);
  });
});

describe('SecretManager precedence + status', () => {
  const providers: CloudProvider[] = ['groq', 'openai', 'gemini'];

  it('prefers the secure store over the env store', () => {
    const manager = new SecretManager({
      secureStore: new MemorySecretStore(),
      envStore: new EnvSecretStore({ SPEAKRIGHT_GROQ_API_KEY: 'from-env' } as NodeJS.ProcessEnv),
    });
    manager.set('groq', 'from-keyring');
    expect(manager.get('groq')).toBe('from-keyring');
    expect(manager.status('groq')).toMatchObject({ source: 'keychain', configured: true });
  });

  it('falls back to env when no secure store entry exists', () => {
    const manager = new SecretManager({
      secureStore: new MemorySecretStore(),
      envStore: new EnvSecretStore({ SPEAKRIGHT_OPENAI_API_KEY: 'sk-env-value' } as NodeJS.ProcessEnv),
    });
    expect(manager.get('openai')).toBe('sk-env-value');
    const status = manager.status('openai');
    expect(status.source).toBe('env');
    expect(status.configured).toBe(true);
    expect(status.masked).toBe('…alue');
  });

  it('reports none when neither store has a key', () => {
    const manager = new SecretManager({ secureStore: new MemorySecretStore() });
    for (const p of providers) {
      expect(manager.get(p)).toBeNull();
      expect(manager.status(p)).toMatchObject({ source: 'none', configured: false });
    }
  });

  it('refuses to persist when no secure store (env-only machine)', () => {
    const manager = new SecretManager({
      envStore: new EnvSecretStore({} as NodeJS.ProcessEnv),
    });
    expect(manager.canPersist()).toBe(false);
    expect(() => manager.set('groq', 'x')).toThrow(/no OS keyring/);
  });

  it('clear removes the secure entry, and get resumes env resolution', () => {
    const manager = new SecretManager({
      secureStore: new MemorySecretStore(),
      envStore: new EnvSecretStore({ SPEAKRIGHT_GROQ_API_KEY: 'from-env' } as NodeJS.ProcessEnv),
    });
    manager.set('groq', 'from-keyring');
    expect(manager.get('groq')).toBe('from-keyring');
    manager.clear('groq');
    expect(manager.get('groq')).toBe('from-env');
    expect(manager.status('groq').source).toBe('env');
  });

  it('masks everything but the last 4 characters', () => {
    expect(maskSecret('sk-abcdefgh-1234')).toBe('…1234');
  });
});

describe('SecretManager round-trip via keychain store semantics', () => {
  it('persists and reports the same value', () => {
    const manager = new SecretManager({ secureStore: new MemorySecretStore() });
    manager.set('gemini', 'AIza-super-secret');
    expect(manager.get('gemini')).toBe('AIza-super-secret');
    expect(manager.status('gemini').masked).toBe('…cret');
  });
});