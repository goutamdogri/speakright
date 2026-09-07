/**
 * End-to-end provider integration test.
 *
 * Exercises the real audio → STT → LLM correction chain under Electron:
 *   1. Raw int16 PCM (16kHz mono) written to a temp WAV file
 *   2. LocalWhisperProvider (whisper-cli + ggml-base.en.bin) → transcript
 *   3. OllamaCorrectionProvider (host ollama) → structured correction
 *
 * External deps must exist or the run exits nonzero:
 *   - whisper-cli in PATH, ~/.local/bin, or /usr/local/bin
 *   - whisper model at ~/.local/share/speakright/whisper/ggml-base.en.bin
 *   - a running `ollama serve` (e.g. http://127.0.0.1:11434)
 *
 * Exit 0 = full chain works. Exit 1 = a check failed or a dep is missing.
 */
import { app } from 'electron';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { LocalWhisperProvider } from '@speakright/transcription';
import { OllamaCorrectionProvider } from '@speakright/correction';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const AUDIO_RAW = process.env.SPEAKRIGHT_TEST_AUDIO ?? '/tmp/jfk-16khz-raw.s16';

function resolveWhisperBin(): string {
  if (process.env.SPEAKRIGHT_WHISPER_BIN) return process.env.SPEAKRIGHT_WHISPER_BIN;
  const userBin = join(homedir(), '.local', 'bin', 'whisper-cli');
  if (existsSync(userBin)) return userBin;
  return '/usr/local/bin/whisper-cli';
}

function resolveWhisperModel(): string {
  return join(homedir(), '.local', 'share', 'speakright', 'whisper', 'ggml-base.en.bin');
}

async function runStt(): Promise<string | null> {
  console.log('[stt] local whisper');
  const bin = resolveWhisperBin();
  const model = resolveWhisperModel();

  check('whisper-cli binary present', existsSync(bin), bin);
  check('whisper model present', existsSync(model), model);
  check('sample audio present', existsSync(AUDIO_RAW), AUDIO_RAW);
  if (!existsSync(bin) || !existsSync(model) || !existsSync(AUDIO_RAW)) return null;

  const provider = new LocalWhisperProvider(bin, model);
  const health = await provider.check();
  check('whisper provider self-check', health.ok, health.message);

  const raw = readFileSync(AUDIO_RAW);
  const transcript = await provider.transcribe(new Uint8Array(raw), { language: 'en', model: 'base' });

  check('whisper produced non-empty transcript', !!transcript.text?.trim(), transcript.text?.slice(0, 80));
  check('transcript looks like speech', /[a-zA-Z]{2,}/.test(transcript.text ?? ''), transcript.text?.slice(0, 120));

  return transcript.text ?? null;
}

async function runLlm(transcript?: string): Promise<void> {
  console.log('[llm] ollama correction');
  const provider = new OllamaCorrectionProvider(
    'http://127.0.0.1:11434',
    process.env.SPEAKRIGHT_LLM_MODEL ?? 'llama3.1',
  );
  const health = await provider.check();
  check('ollama reachable with model', health.ok, health.message);
  if (!health.ok) return;

  const text = transcript ?? 'I have went to the store yesterday and him buyed a soda and me too.';
  const result = await provider.correct({ transcript: text });
  check('correction returned structured result', !!result && typeof result.has_correction === 'boolean', JSON.stringify(result).slice(0, 160));
}

void app.whenReady().then(async () => {
  try {
    const transcript = await runStt();
    await runLlm(transcript);
    console.log('');
    if (failures === 0) {
      console.log('All E2E provider checks passed.');
      app.exit(0);
    } else {
      console.error(`${failures} E2E provider check(s) FAILED`);
      app.exit(1);
    }
  } catch (err) {
    console.error('E2E provider test crashed:', err);
    app.exit(1);
  }
});