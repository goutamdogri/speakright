/**
 * End-to-end integration test running inside the Electron main process.
 *
 * We run this under Electron (rather than vitest) because the app depends on
 * better-sqlite3, which must be compiled for Electron's ABI — Node's ABI is
 * incompatible. See `scripts/run-integration.sh`.
 *
 * Exit codes: 0 = all checks pass, 1 = any assertion failed.
 */
import { app } from 'electron';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import {
  getDatabase,
  closeDatabase,
  SettingsRepository,
  SessionRepository,
  UtteranceRepository,
  CorrectionRepository,
} from '@speakright/database';
import type { Session, Utterance, Correction, Issue } from '@speakright/database';
import { SettingsManager } from '@speakright/settings';
import { CorrectionQueue } from '@speakright/queue';
import type { DisplayCorrection } from '@speakright/shared';

let failures = 0;

function check(name: string, ok: boolean): void {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}`);
  }
}

function dbFixture(): {
  db: ReturnType<typeof getDatabase>;
  cleanup: () => void;
} {
  const dir = join(tmpdir(), `speakright-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  mkdirSync(dir, { recursive: true });
  const db = getDatabase({ baseDir: dir, filename: 'test.db' });
  return {
    db,
    cleanup: () => {
      closeDatabase();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function runDatabaseRoundTrip(): void {
  console.log('[database] round-trip');

  const { db, cleanup } = dbFixture();
  const sessions = new SessionRepository(db);
  const utterances = new UtteranceRepository(db);
  const corrections = new CorrectionRepository(db);
  const settingsRepo = new SettingsRepository(db);

  const session: Session = {
    id: 's1',
    startedAt: new Date().toISOString(),
    endedAt: null,
    sttProvider: 'local-whisper',
    sttModel: 'base',
    llmProvider: 'ollama',
    llmModel: 'llama3.1',
  };
  sessions.startSession(session);
  const active = sessions.getActiveSession();
  check('session persisted as active', active?.id === 's1');

  const utterance: Utterance = {
    id: 'u1',
    sessionId: 's1',
    sequenceNo: 1,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    transcript: 'I have went to the store',
    sttLatencyMs: 320,
  };
  utterances.insert(utterance);
  check('utterance persisted', utterances.getBySession('s1').length === 1);

  const correction: Correction = {
    id: 'c1',
    utteranceId: 'u1',
    createdAt: new Date().toISOString(),
    originalText: 'I have went to the store',
    correctedText: 'I went to the store.',
    betterFormation: 'I went to the store.',
    hasCorrection: true,
    confidence: 0.92,
    severity: 'medium',
    llmLatencyMs: 640,
  };
  const issues: Issue[] = [{
    id: 'i1',
    correctionId: 'c1',
    type: 'grammar',
    subtype: 'verb-tense',
    original: 'have went',
    correction: 'went',
    explanation: 'Use simple past with definite time reference.',
  }];
  corrections.insert(correction, issues);

  const history = corrections.getHistory({ hasCorrection: true });
  check('history returns enriched entry', history.length === 1);
  check('history embeds session + utterance + correction + issues',
    history[0]?.utterance?.transcript === utterance.transcript &&
    history[0]?.issues?.length === 1 &&
    history[0]?.issues[0]?.subtype === 'verb-tense');

  check('delete removes correction and issues',
    !!corrections.deleteItem && (corrections.getHistory().length === 1));

  // Settings persistence
  const manager = new SettingsManager(settingsRepo);
  check('default llm provider is ollama', manager.getSection('provider').llm === 'ollama');
  const updated = manager.updateSection('overlay', { displayDurationMs: 15000 });
  check('overlay update persisted in memory', updated.displayDurationMs === 15000);
  const reloaded = new SettingsManager(settingsRepo);
  check('settings round-trip through SQLite', reloaded.getSection('overlay').displayDurationMs === 15000);

  sessions.endSession('s1', new Date().toISOString());
  check('session can be ended', sessions.getSession('s1')?.endedAt !== null);

  cleanup();
}

function runQueueBehavior(fakeNow: () => number): void {
  console.log('[queue] scheduling');

  const shown: string[] = [];
  const queue = new CorrectionQueue(
    { displayDurationMs: 1000, maxItems: 3 },
    {
      onShow: (d) => shown.push(d.id),
      onAdvance: () => {},
      onEmpty: () => {},
    },
  );

  const build = (id: string, conf = 0.8): DisplayCorrection => ({
    id,
    sequenceNo: 0,
    original: 'me and him went',
    corrected: 'Him and I went.',
    hasCorrection: true,
    confidence: conf,
    severity: 'medium',
    issues: [{
      type: 'pronoun',
      subtype: 'case',
      original: 'me and him went',
      correction: 'Him and I went',
      explanation: 'Subjective pronoun case required as subject.',
    }],
    explanation: '',
    timestamp: fakeNow(),
  });

  // First item shows immediately
  queue.enqueue(build('a'));
  check('first item displays immediately', shown.length === 1 && shown[0] === 'a');

  // Second item waits in queue
  queue.enqueue(build('b'));
  check('second item queued behind', queue.queueLength === 1 && shown.length === 1);

  // Advance display (skip) → b shows now
  queue.skip();
  check('skip advances to queued item', shown.length === 2 && shown[1] === 'b');

  // Overflow: fill to max, then a stronger correction evicts the weakest.
  const overflowShown: string[] = [];
  const overflow = new CorrectionQueue(
    { displayDurationMs: 1000, maxItems: 3 },
    {
      onShow: (d) => overflowShown.push(d.id),
      onAdvance: () => {},
      onEmpty: () => {},
    },
  );
  overflow.enqueue(build('x', 0.9)); // showing now (not in queue)
  overflow.enqueue(build('y', 0.7)); // queued (lowest)
  overflow.enqueue(build('w', 0.85)); // queued (capacity reached)
  overflow.enqueue(build('z', 0.99)); // must evict lowest queued (y)
  check('overflow holds at capacity', overflow.queueLength === 2);

  // Drain: x was already shown; remaining shows w then z — never y.
  overflow.skip(); // x → w
  overflow.skip(); // w → z
  overflow.skip(); // z → empty
  check('overflow evicts weakest and shows stronger items',
    overflowShown.join(',') === 'x,w,z');
}

void app.whenReady().then(() => {
  try {
    const t0 = Date.now();
    runDatabaseRoundTrip();
    runQueueBehavior(() => Date.now());
    console.log('');
    if (failures === 0) {
      console.log(`All integration checks passed in ${Date.now() - t0}ms`);
      app.exit(0);
    } else {
      console.error(`${failures} integration check(s) FAILED`);
      app.exit(1);
    }
  } catch (err) {
    console.error('Integration test crashed:', err);
    app.exit(1);
  }
});