import type { AppSettings } from '@speakright/shared';

/**
 * Default application settings. These are the baseline values used
 * when no persisted setting exists yet.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  general: {
    launchAtStartup: false,
    language: 'en',
  },
  audio: {
    deviceId: null,
    vadSensitivity: 0.5,
    silenceDurationMs: 700,
    maxUtteranceMs: 10000,
  },
  provider: {
    stt: 'local-whisper',
    sttModel: 'base',
    llm: 'ollama',
    llmModel: 'llama3.1',
    useLocalOnly: true,
    contextWindowSize: 3,
  },
  overlay: {
    position: { x: -1, y: -1 }, // -1 means default (top-right)
    width: 420,
    opacity: 0.95,
    fontSize: 14,
    displayDurationMs: 10000,
    queueLimit: 20,
  },
  correction: {
    grammar: true,
    structure: true,
    formation: true,
    confidenceThreshold: 0.6,
    showConfirmations: false,
  },
  hotkeys: {
    toggleListening: 'Control+Alt+E',
    pauseResume: 'Control+Alt+P',
    toggleOverlay: 'Control+Alt+S',
  },
  privacy: {
    localOnly: true,
    notifyOnCloud: true,
  },
};
