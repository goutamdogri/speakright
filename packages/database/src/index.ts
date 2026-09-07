export { getDatabase, closeDatabase } from './connection.js';
export { runMigrations, CURRENT_VERSION } from './migrations.js';
export { SessionRepository } from './repositories/session-repo.js';
export { UtteranceRepository } from './repositories/utterance-repo.js';
export { CorrectionRepository } from './repositories/correction-repo.js';
export { SettingsRepository } from './repositories/settings-repo.js';
export type * from './types.js';
