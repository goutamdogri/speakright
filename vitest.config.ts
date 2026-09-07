import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      'electron': resolve(__dirname, 'tests/mocks/electron.ts'),
      '@speakright/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
      '@speakright/queue': resolve(__dirname, 'packages/queue/src/index.ts'),
      '@speakright/audio': resolve(__dirname, 'packages/audio/src/index.ts'),
      '@speakright/correction': resolve(__dirname, 'packages/correction/src/index.ts'),
      '@speakright/database': resolve(__dirname, 'packages/database/src/index.ts'),
      '@speakright/settings': resolve(__dirname, 'packages/settings/src/index.ts'),
    },
  },
});