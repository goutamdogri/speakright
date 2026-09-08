import type { CloudProvider } from '@speakright/shared';
import type { SecretStore, SecretSource } from './secret-store.js';
import { EnvSecretStore } from './env-secret-store.js';
import { MemorySecretStore } from './memory-secret-store.js';

/** Only the last 4 characters of a secret are ever shown in the UI. */
export function maskSecret(secret: string): string {
  const tail = secret.slice(-4);
  return `…${tail}`;
}

/** The provider names that require a credential for cloud access. */
export const CLOUD_PROVIDERS: CloudProvider[] = ['groq', 'openai', 'gemini'];

/**
 * Resolves API keys from a prioritized set of stores.
 *
 * Precedence: `secureStore` (OS-keychain-encrypted, user-entered in the UI)
 * first, then `envStore` (.env / environment). `secureStore` is optional so
 * machines without an OS keyring still work through env-only keys.
 */
export class SecretManager {
  private readonly secureStore: SecretStore | null;
  private readonly envStore: SecretStore;

  constructor(options: { secureStore?: SecretStore; envStore?: SecretStore }) {
    this.secureStore = options.secureStore ?? null;
    this.envStore = options.envStore ?? new EnvSecretStore();
  }

  /** Raw resolved key for a provider (or null). Only used by the main process. */
  get(provider: CloudProvider): string | null {
    return this.secureStore?.get(provider) ?? this.envStore.get(provider);
  }

  /** Persist a user-entered key (no-op unless a secure store exists). */
  set(provider: CloudProvider, value: string): void {
    if (!this.secureStore) {
      throw new Error(
        `Cannot store an API key for "${provider}": no OS keyring available. ` +
          'Set SPEAKRIGHT_*_API_KEY in your environment / .env instead.',
      );
    }
    this.secureStore.set(provider, value);
  }

  clear(provider: CloudProvider): void {
    this.secureStore?.clear(provider);
  }

  /** Where the resolved key comes from, plus a masked preview for the UI. */
  status(provider: CloudProvider): { source: SecretSource; configured: boolean; masked?: string } {
    const secure = this.secureStore?.has(provider) ?? false;
    const env = this.envStore.has(provider);
    const resolved = this.get(provider);

    if (secure) return { source: 'keychain', configured: true, masked: resolved ? maskSecret(resolved) : undefined };
    if (env) return { source: 'env', configured: true, masked: resolved ? maskSecret(resolved) : undefined };
    return { source: this.secureStore ? 'none' : 'none', configured: false };
  }

  /** True when the machine can persist secrets (OS keyring present). */
  canPersist(): boolean {
    return this.secureStore !== null;
  }
}

/** Convenience factory used by tests and the desktop main process. */
export function createSecretManager(options?: {
  secureStore?: SecretStore;
  envStore?: SecretStore;
  allowFallbackToMemory?: boolean;
}): SecretManager {
  const secureStore = options?.secureStore ?? (options?.allowFallbackToMemory ? new MemorySecretStore() : undefined);
  return new SecretManager({ secureStore, envStore: options?.envStore ?? new EnvSecretStore() });
}