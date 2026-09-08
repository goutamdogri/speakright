import type { CloudProvider } from '@speakright/shared';
import type { SecretStore } from './secret-store.js';

/** In-memory key store — for tests and throwaway dev runs. Not persisted. */
export class MemorySecretStore implements SecretStore {
  private readonly values = new Map<CloudProvider, string>();

  get(provider: CloudProvider): string | null {
    return this.values.get(provider) ?? null;
  }

  set(provider: CloudProvider, value: string): void {
    this.values.set(provider, value);
  }

  clear(provider: CloudProvider): void {
    this.values.delete(provider);
  }

  has(provider: CloudProvider): boolean {
    return this.values.has(provider);
  }
}