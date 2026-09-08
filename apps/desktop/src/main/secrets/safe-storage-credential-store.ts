import { safeStorage } from 'electron';
import type { CloudProvider } from '@speakright/shared';
import type { SecretStore } from '@speakright/secrets';
import type { SettingsRepository } from '@speakright/database';

/**
 * API-key store backed by Electron's `safeStorage` (OS-keychain-encrypted).
 *
 * Keys are encrypted with the platform keychain (libsecret/Keychain/DPAPI) and
 * the ciphertext is persisted in the SQLite `settings` table under
 * `secret:<provider>`. An attacker who finds the DB file gets only ciphertext.
 *
 * Only usable when `safeStorage.isEncryptionAvailable()` is true (an OS keyring
 * is present). On machines without one the caller should wire `EnvSecretStore`
 * instead — see SecretManager.
 */
export class SafeStorageCredentialStore implements SecretStore {
  constructor(private readonly repo: SettingsRepository) {}

  private keyOf(provider: CloudProvider): string {
    return `secret:${provider}`;
  }

  get(provider: CloudProvider): string | null {
    const encoded = this.repo.get(this.keyOf(provider));
    if (!encoded) return null;
    try {
      return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
    } catch (err) {
      // Keychain changed / secrets not yet available — treat as unset.
      console.error(`[Secrets] Failed to decrypt "${provider}" key:`, (err as Error).message);
      return null;
    }
  }

  set(provider: CloudProvider, value: string): void {
    const encrypted = safeStorage.encryptString(value).toString('base64');
    this.repo.set(this.keyOf(provider), encrypted);
  }

  clear(provider: CloudProvider): void {
    this.repo.delete(this.keyOf(provider));
  }

  has(provider: CloudProvider): boolean {
    return this.repo.get(this.keyOf(provider)) !== null;
  }
}

export function canUseKeychain(): boolean {
  return safeStorage.isEncryptionAvailable();
}