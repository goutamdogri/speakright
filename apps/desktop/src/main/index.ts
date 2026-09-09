import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import { join } from 'node:path';
import { IPC } from '@speakright/shared';
import type { AppSettings, CloudProvider, SecretStatus } from '@speakright/shared';
import { SecretManager, EnvSecretStore } from '@speakright/secrets';
import { PipelineController } from './pipeline-controller.js';
import { SafeStorageCredentialStore, canUseKeychain } from './secrets/safe-storage-credential-store.js';

// GPU hardware acceleration fails on many Linux/VM setups (missing/unsupported
// GPU process). The overlay must stay cheap and reliable, so software raster
// is preferred. Must run before 'ready'.
app.disableHardwareAcceleration();
import { OverlayController } from './overlay-controller.js';
import { AudioHostController } from './audio-host-controller.js';
import { HotkeyManager } from './hotkey-manager.js';
import { TrayController } from './tray-controller.js';
import { getDatabase, closeDatabase, SettingsRepository, SessionRepository, UtteranceRepository, CorrectionRepository } from '@speakright/database';
import { SettingsManager } from '@speakright/settings';

export interface AppContext {
  settings: SettingsManager;
  sessionRepo: SessionRepository;
  utteranceRepo: UtteranceRepository;
  correctionRepo: CorrectionRepository;
  overlay: OverlayController;
  audioHost: AudioHostController;
  pipeline: PipelineController;
  tray: TrayController;
  hotkeys: HotkeyManager;
  secrets: SecretManager;
}

let ctx: AppContext;
let settingsWindow: BrowserWindow | null = null;
let audioDevices: { deviceId: string; label: string }[] = [];

function createSettingsWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    show: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    backgroundColor: '#f7f6f4',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#/settings`);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  win.on('maximize', () => win.webContents.send(IPC.WINDOW_MAXIMIZE_CHANGED, true));
  win.on('unmaximize', () => win.webContents.send(IPC.WINDOW_MAXIMIZE_CHANGED, false));

  win.on('closed', () => { settingsWindow = null; });
  settingsWindow = win;
  return win;
}

async function bootstrap(): Promise<void> {
  const db = getDatabase({ baseDir: app.getPath('userData') });
  const settings = new SettingsManager(new SettingsRepository(db));
  const sessionRepo = new SessionRepository(db);
  const utteranceRepo = new UtteranceRepository(db);
  const correctionRepo = new CorrectionRepository(db);

  // Credentials: OS-keychain-encrypted (safeStorage) primary, .env fallback.
  // Load a gitignored .env if present so SPEAKRIGHT_*_API_KEY works in dev.
  loadDotEnv();
  const keyringAvailable = canUseKeychain();
  const secureStore = keyringAvailable ? new SafeStorageCredentialStore(new SettingsRepository(db)) : null;
  const secrets = new SecretManager({
    ...(secureStore ? { secureStore } : {}),
    envStore: new EnvSecretStore(),
  });
  const getApiKey = (provider: CloudProvider): string | null => {
    try {
      return secrets.get(provider);
    } catch {
      return null;
    }
  };
  console.log(`[Secrets] Keychain storage: ${keyringAvailable ? 'available (safeStorage)' : 'unavailable — using SPEAKRIGHT_* env/.env keys'}`);

  const overlay = new OverlayController(settings);
  const audioHost = new AudioHostController();
  const pipeline = new PipelineController({
    settings,
    sessionRepo,
    utteranceRepo,
    correctionRepo,
    audioHost,
    getApiKey,
    isOverlayHidden: () => !overlay.isVisible(),
    onCorrection: display => overlay.show(display),
    onLiveEvent: event => broadcastLive(IPC.LIVE_TRANSCRIPT, event),
  });

  const tray = new TrayController({
    onToggleListening: () => pipeline.toggleListening(),
    onPauseResume: () => pipeline.pauseResume(),
    onOpenSettings: () => openSettingsWindow(),
    onQuit: () => app.quit(),
  });

  const hotkeys = new HotkeyManager(settings, {
    onToggleListening: () => pipeline.toggleListening(),
    onPauseResume: () => pipeline.pauseResume(),
    onToggleOverlay: () => setOverlayVisible(!ctx.overlay?.isVisible()),
  });

  ctx = { settings, sessionRepo, utteranceRepo, correctionRepo, overlay, audioHost, pipeline, tray, hotkeys, secrets };

  registerIpcHandlers();
  hotkeys.registerAll();
  overlay.createWindow();
  await audioHost.create();
  tray.create();
  createAppMenu();
  openSettingsWindow();

  console.log(
    '[SpeakRight] Running. The UI is the Electron window (not the dev-server URL in your terminal). ' +
      'Open Settings from the app menu (or the tray icon if shown), or press Ctrl+Alt+E to toggle listening.',
  );

  app.on('will-quit', () => hotkeys.unregisterAll());
}

/** Load a gitignored `.env` if present (no-op otherwise). */
function loadDotEnv(): void {
  // Node >= 20.12 (Electron 31 ships Node 20) — throws if the file is absent.
  const candidates = [
    join(app.getAppPath(), '.env'),
    join(process.cwd(), '.env'),
  ];
  for (const file of candidates) {
    try {
      process.loadEnvFile?.(file);
    } catch {
      // Absent file — try the next candidate.
    }
  }
}

function createAppMenu(): void {
  const menu = Menu.buildFromTemplate([
    {
      label: 'SpeakRight',
      submenu: [
        { label: 'Open Settings', click: () => openSettingsWindow() },
        { label: 'Toggle Listening', accelerator: 'CmdOrCtrl+Alt+E', click: () => toggleListening() },
        { label: 'Pause / Resume', accelerator: 'CmdOrCtrl+Alt+P', click: () => pauseResume() },
        { type: 'separator' },
        { label: 'Quit', role: 'quit' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

function openSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  createSettingsWindow();
}

function toggleListening(): void {
  ctx.pipeline.toggleListening();
  syncStatus();
}

function pauseResume(): void {
  ctx.pipeline.pauseResume();
  syncStatus();
}

/** Push the latest listening state to the tray, app menu and open windows. */
function syncStatus(): void {
  const state = ctx.pipeline.getStatus().listening;
  ctx.tray.setState(state);
  settingsWindow?.webContents.send(IPC.LISTENING_STATE_CHANGED, state);
  ctx.overlay.broadcastListening(state);
}

/** Broadcast a live transcript/state event to the settings window. */
function broadcastLive(channel: string, payload: unknown): void {
  settingsWindow?.webContents.send(channel, payload);
}

function registerIpcHandlers(): void {
  // Settings
  ipcMain.handle(IPC.GET_SETTINGS, () => ctx.settings.getAll());
  ipcMain.handle(IPC.UPDATE_SETTINGS, (_e, patch: Partial<AppSettings>) => {
    const updated = ctx.settings.update(patch);
    ctx.hotkeys.reapply();
    ctx.pipeline.notifySettingsChanged();
    ctx.overlay.applySettings(updated);
    // When the selected mic changes, push it to the audio host so VAD opens
    // the right device (works even mid-listening, as the pipeline restarts).
    if (patch.audio?.deviceId !== undefined) {
      ctx.audioHost.setDevice(patch.audio.deviceId);
    }
    return updated;
  });

  // History
  ipcMain.handle(IPC.GET_HISTORY, (_e, filter) => ctx.correctionRepo.getHistory(filter));
  ipcMain.handle(IPC.DELETE_HISTORY_ITEM, (_e, id) => ctx.correctionRepo.deleteItem(id));
  ipcMain.handle(IPC.CLEAR_HISTORY, () => ctx.correctionRepo.clearAll());

  // Pipeline status
  ipcMain.handle(IPC.GET_STATUS, () => ctx.pipeline.getStatus());
  ipcMain.handle(IPC.TOGGLE_LISTENING, () => { toggleListening(); });
  ipcMain.handle(IPC.PAUSE_RESUME, () => { pauseResume(); });

  // Audio utterance from renderer after VAD detection
  ipcMain.handle(IPC.AUDIO_UTTERANCE_READY, (_e, payload: {
    samples: number[]; sampleRate: number; startTime: number; endTime: number;
  }) => {
    const samples = new Float32Array(payload.samples);
    return ctx.pipeline.handleUtterance({
      samples,
      sampleRate: payload.sampleRate,
      startTime: payload.startTime,
      endTime: payload.endTime,
      durationMs: payload.endTime - payload.startTime,
    });
  });

  // Voice-activity state from the audio host (speaking / silence).
  ipcMain.handle(IPC.SPEECH_STATE_CHANGED, (_e, speaking: boolean) => {
    broadcastLive(IPC.LIVE_STATE, { kind: 'speaking', value: speaking, at: Date.now() });
  });

  // Device enumeration (audio host renderer reports them; cached for the UI)
  ipcMain.handle(IPC.GET_DEVICES, async () => {
    return audioDevices;
  });
  ipcMain.on(IPC.AUDIO_DEVICES_REPORT, (_e, devices: { deviceId: string; label: string }[]) => {
    audioDevices = devices;
  });

  // Overlay auto-sizing (renderer reports its content height)
  ipcMain.on(IPC.OVERLAY_RESIZE, (_e, width: number, height: number) => {
    ctx.overlay.resize(width, height);
  });

  // Hide/show the overlay. Hiding pauses the display queue so corrections
  // accumulate and replay in order (with their full display duration) when the
  // overlay is shown again; the listening pipeline and its queue keep running.
  ipcMain.handle(IPC.OVERLAY_SET_VISIBLE, (_e, visible: boolean) => setOverlayVisible(Boolean(visible)));
  ipcMain.handle(IPC.OVERLAY_GET_VISIBLE, () => ctx.overlay.isVisible());
  ipcMain.handle(IPC.GET_QUEUE, () => ctx.pipeline.getQueueContent());

  // Provider health (STT + LLM). Cloud providers are checked against their
  // real API endpoints using the configured key.
  ipcMain.handle(IPC.CHECK_PROVIDERS, async () => ({
    stt: await ctx.pipeline.checkSttHealth(),
    llm: await ctx.pipeline.checkLlmHealth(),
  }));

  // Cloud credentials (main-only). Renderers can set/clear, and read status —
  // never the raw key.
  ipcMain.handle(IPC.GET_SECRETS_STATUS, () => {
    const result: Record<string, SecretStatus> = {};
    for (const provider of ['groq', 'openai', 'gemini'] as CloudProvider[]) {
      result[provider] = ctx.secrets.status(provider);
    }
    return { canPersist: ctx.secrets.canPersist(), secrets: result };
  });

  ipcMain.handle(IPC.SET_SECRET, (_e, provider: CloudProvider, key: string) => {
    if (!['groq', 'openai', 'gemini'].includes(provider)) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    const value = String(key ?? '').trim();
    if (!value) throw new Error('API key cannot be empty');
    ctx.secrets.set(provider, value);
    ctx.pipeline.notifySettingsChanged();
    return ctx.secrets.status(provider);
  });

  ipcMain.handle(IPC.CLEAR_SECRET, (_e, provider: CloudProvider) => {
    ctx.secrets.clear(provider);
    ctx.pipeline.notifySettingsChanged();
    return ctx.secrets.status(provider);
  });

  // Model catalogs for the currently selected STT/LLM providers.
  ipcMain.handle(IPC.LIST_MODELS, (_e, kind: 'stt' | 'llm') => {
    return kind === 'llm' ? ctx.pipeline.listLlmModels() : ctx.pipeline.listSttModels();
  });

  // Window controls (frameless settings window)
  ipcMain.handle(IPC.WINDOW_MINIMIZE, () => settingsWindow?.minimize());
  ipcMain.handle(IPC.WINDOW_TOGGLE_MAXIMIZE, () => {
    if (!settingsWindow) return;
    if (settingsWindow.isMaximized()) settingsWindow.unmaximize();
    else settingsWindow.maximize();
  });
  ipcMain.handle(IPC.WINDOW_CLOSE, () => settingsWindow?.close());
}

/** Hide/show the overlay, pausing/resuming the display queue accordingly. */
function setOverlayVisible(visible: boolean): boolean {
  ctx.overlay.setVisible(visible);
  if (visible) ctx.pipeline.resumeQueue();
  else ctx.pipeline.pauseQueue();
  return ctx.overlay.isVisible();
}

app.whenReady().then(() => {
  void bootstrap();
});

app.on('window-all-closed', () => {
  // Keep app alive in tray
});

app.on('before-quit', () => {
  ctx?.pipeline.stop();
  ctx?.overlay.destroy();
  ctx?.audioHost.destroy();
  closeDatabase();
});
