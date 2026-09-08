import type { CloudProvider } from '@speakright/shared';

/**
 * A (provider-scoped) API-key store.
 *
 * Stores never return keys to UI code, and never write plaintext where it can
 * be read. Concrete backends:
 *  - {@link EnvSecretStore}            — keys from SPEAKRIGHT_* env vars / .env
 *  - {@link MemorySecretStore}         — in-memory (tests, dev)
 *  - desktop SafeStorageCredentialStore — OS-keychain-encrypted (in the app)
 */
export interface SecretStore {
  /** The raw secret for a provider, or null when unset. */
  get(provider: CloudProvider): string | null;
  set(provider: CloudProvider, value: string): void;
  clear(provider: CloudProvider): void;
  has(provider: CloudProvider): boolean;
}

export type SecretSource = 'keychain' | 'env' | 'memory' | 'none';