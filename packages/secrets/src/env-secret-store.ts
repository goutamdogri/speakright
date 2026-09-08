import type { CloudProvider } from '@speakright/shared';
import type { SecretStore } from './secret-store.js';

const ENV_VAR_BY_PROVIDER: Record<CloudProvider, string> = {
  groq: 'SPEAKRIGHT_GROQ_API_KEY',
  openai: 'SPEAKRIGHT_OPENAI_API_KEY',
  gemini: 'SPEAKRIGHT_GEMINI_API_KEY',
};

/**
 * Reads API keys from environment variables (optionally seeded by a .env file
 * loaded by the caller). Preferred environment names follow
 * `SPEAKRIGHT_<PROVIDER>_API_KEY`.
 */
export class EnvSecretStore implements SecretStore {
  private readonly env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  get(provider: CloudProvider): string | null {
    const value = this.env[ENV_VAR_BY_PROVIDER[provider]];
    return value && value.trim() ? value.trim() : null;
  }

  set(_provider: CloudProvider, _value: string): void {
    // Environment variables are read-only at runtime.
  }

  clear(_provider: CloudProvider): void {
    // Environment variables are read-only at runtime.
  }

  has(provider: CloudProvider): boolean {
    return this.get(provider) !== null;
  }
}