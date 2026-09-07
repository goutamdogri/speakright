# SpeakRight — Personal English Speaking Coach

A cross-platform (Linux & Windows) desktop app that listens to your microphone,
detects complete spoken utterances, transcribes them, evaluates them for
grammar / sentence-structure / phrasing problems, and shows **one concise
correction at a time** in an always-on-top overlay — so you can improve your
spoken English without interrupting a live conversation in Google Meet, Zoom,
Teams, Discord, a browser, or a terminal.

- Default Speech-to-Text: **local whisper.cpp** (nothing leaves your machine)
- Default LLM: **local Ollama** (`llama3.1`)
- Optional cloud providers: **Groq**, **Gemini**, **OpenAI** (STT + LLM)
- Persistence: **SQLite** (history survives restart)
- Designed for a single primary user; structured to evolve to multi-user later

The authoritative product spec lives in [`docs/personal_english_coach_prd.md`](docs/personal_english_coach_prd.md).

---

## Architecture

Monorepo using `pnpm workspaces`.

```
apps/
  desktop/                    Electron app (main + preload + 3 renderer windows)
    src/main/                 Main process: pipeline orchestration, tray, hotkeys,
                              overlay/audio-host controllers, IPC handlers
    src/preload/              context-isolated bridge used by all renderers
    src/renderer/             Settings window (index.html) + overlay + audio-host
    src/overlay/              Overlay React components (displayed correction card)
    src/audio-host/           Audio capture page: mic → VAD → raw utterances
packages/
  shared/                     Shared types, IPC channel constants, Zod correction schema
  audio/                      Microphone capture, circular audio buffer, VAD engines
                              (energy-based + Silero), audio pipeline types
  transcription/              STT router + providers (Local Whisper, Groq, OpenAI, Gemini)
  correction/                 LLM router, shared prompt + strict/tolerant parsing,
                              providers (Ollama, Groq, Gemini, OpenAI)
  queue/                      Correction display queue (max 20, overflow drops lowest
                              confidence, one-at-a-time ≥10s display)
  database/                   better-sqlite3 connection + migrations + repositories
                              (sessions, utterances, corrections, history, settings)
  settings/                   Typed settings manager with defaults + validation
scripts/
  download-whisper-model.sh   Fetch ggml-base/small/medium.en.bin models
  run-integration.sh          Electron-based integration/E2E test runner
tests/
  unit/                       Vitest unit tests (queue, VAD, schema, settings)
  integration/                DB + queue round-trip, runs inside Electron main process
  e2e/                        Real whisper-cli + Ollama end-to-end provider test
```

### Data + correction pipeline

```
microphone ─▶ VAD (utterance boundary) ─▶ whisper.cpp (local STT)
                                        ─▶ LLM (default Ollama) → structured JSON
                                        ─▶ tolerant schema validation
                                        ─▶ correction queue → always-on-top overlay
                                        ─▶ SQLite history
```

---

## Prerequisites

| Tool      | Version   | Notes                                             |
|-----------|-----------|---------------------------------------------------|
| Node.js   | >= 22     |                                                   |
| pnpm      | >= 12     |                                                   |
| whisper.cpp | any    | `whisper-cli` binary on `PATH` (see below)        |
| Ollama    | any       | `ollama serve` running with `llama3.1`            |

> **Note**: better-sqlite3 must be compiled for Electron's ABI. Node's ABI is
> incompatible — this is why the integration/E2E tests run inside Electron
> rather than plain Vitest. See `rebuild` script in the root `package.json`;
> run `pnpm rebuild` after installing or upgrading Electron.

---

## Setup

```bash
# 1. Install JS dependencies (this configures the native module builds)
pnpm install

# 2. Build all workspace packages + the desktop app
pnpm build

# 3. Compile better-sqlite3 for the Electron runtime ABI
pnpm rebuild

# 4a. Install the local STT binary (whisper.cpp)
#     Build it yourself, e.g.:
#       git clone https://github.com/ggml-org/whisper.cpp
#       cd whisper.cpp
#       git submodule update --init           # fetches ggml
#       cmake -B build -DCMAKE_BUILD_TYPE=Release
#       cmake --build build --target whisper-cli
#     The stock release tarballs may be dynamically linked and fail at runtime
#     with "libwhisper.so.1: cannot open shared object file"; building with
#     CMake as above produces a binary with whisper/ggml linked in statically,
#     which needs no extra LD_LIBRARY_PATH.
#     Then put `whisper-cli` on your PATH or set SPEAKRIGHT_WHISPER_BIN.
#     The app also looks in ~/.local/bin and /usr/local/bin automatically.

# 4b. Download the default STT model (~140 MB)
./scripts/download-whisper-model.sh base

# 5. Make sure Ollama is running with the default model
ollama serve                                  # (or use the Ollama app)
ollama pull llama3.1
```

### Environment variables (optional)

| Variable               | Purpose                                          |
|------------------------|--------------------------------------------------|
| `SPEAKRIGHT_WHISPER_BIN` | Override whisper-cli path                     |
| `SPEAKRIGHT_WHISPER_DIR` | Model directory (default `~/.local/share/speakright/whisper`) |
| `SPEAKRIGHT_TEST_AUDIO`  | Raw 16 kHz mono PCM file for the E2E test     |

API keys for Groq/Gemini/OpenAI (if you enable those providers) are set inside
the app's Settings UI and stored via the settings repository.

---

## Running

```bash
pnpm dev        # start the app in development mode (with hot reload)
```

This launches the Electron app with three windows: **Settings**, the always-on-top
**Overlay**, and the hidden **Audio Host** (mic capture). The Settings window
opens automatically and is the primary UI:

- The **Home** tab has a big *Start Listening* button, live status, a provider
  health check, and a short "how to use" guide.
- Use the app's **SpeakRight menu** (top of the window, or the tray icon if your
  desktop shows it) to open Settings, toggle listening, or quit.
- **Tray icon is optional.** Some Linux desktops (e.g. GNOME without an
  AppIndicator extension) don't show tray icons — the app menu and hotkeys work
  regardless.

The Settings and overlay windows can be closed; re-open them from the app menu.

> **Note:** `electron-vite` also prints a dev-server URL (`http://localhost:5173`).
> That URL is only used internally to load the UI into the Electron windows — it
> is **not** a web page you open in a browser. Use the Electron window instead.

Notes:
- On Linux machines without a SUID `chrome-sandbox`, Electron must run with
  `--no-sandbox`. The `dev` script already passes `--noSandbox`, and the main
  process disables GPU hardware acceleration by default (reliable on VMs /
  headless setups).
- To point the app at cloud providers or change hotkeys / display duration /
  queue size, use the Settings window.
- The desktop UI uses Tailwind CSS compiled through PostCSS at build/dev time
  (`electron.vite.config.ts` + `postcss.config.js` + `tailwind.config.js`).

### Hotkeys (defaults)

| Action                 | Hotkey     |
|------------------------|------------|
| Toggle listening       | `Ctrl+Alt+E` |
| Pause / resume         | `Ctrl+Alt+P` |
| Toggle overlay         | `Ctrl+Alt+S` |

---

## Configuration defaults

| Setting            | Default                                   |
|--------------------|-------------------------------------------|
| STT provider       | `local-whisper` (whisper.cpp `base` model) |
| LLM provider       | `ollama` (`llama3.1`)                     |
| Correction display | 1 at a time, minimum 10 seconds           |
| Queue capacity     | max 20 (overflow evicts lowest confidence) |
| Confidence floor   | 0.6 (below this, corrections are suppressed) |
| Persistence        | SQLite at Electron's `userData` directory  |

---

## Tests

```bash
pnpm test                 # unit tests (Vitest) — 21 tests
pnpm test:integration     # DB + queue round-trip inside Electron main
pnpm test:e2e             # real whisper-cli + Ollama end-to-end providers
```

The E2E test needs the sample audio file (16 kHz mono int16 PCM, default
`/tmp/jfk-16khz-raw.s16`), `whisper-cli`, its model, and a running Ollama with
`llama3.1`. Missing dependencies fail the run with a clear message.

---

## Other commands

```bash
pnpm build          # build all 7 packages + desktop app (tsc + electron-vite)
pnpm typecheck      # tsc --noEmit across all packages
pnpm lint           # ESLint across all packages
pnpm format         # Prettier write pass
pnpm clean          # remove node_modules + build output in every package
pnpm rebuild        # recompile better-sqlite3 for Electron's ABI
```

---

## Supported providers

| Layer | Local        | Cloud                       |
|-------|--------------|-----------------------------|
| STT   | whisper.cpp  | Groq, OpenAI, Gemini        |
| LLM   | Ollama       | Groq, OpenAI, Gemini        |

Configure provider/model per layer in the Settings → Providers view. When a
cloud provider is enabled, audio/transcripts are sent to that provider's API;
with the local defaults, nothing leaves your machine.

---

## License

MIT