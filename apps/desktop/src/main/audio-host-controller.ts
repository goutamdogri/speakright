import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { IPC } from '@speakright/shared';

/**
 * Manages the hidden audio host window that captures microphone audio
 * and runs VAD. The main process commands it to start/stop capture
 * when the user toggles listening.
 */
export class AudioHostController {
  private win: BrowserWindow | null = null;
  private captureActive = false;

  async create(): Promise<void> {
    if (this.win) return;

    this.win = new BrowserWindow({
      width: 300,
      height: 200,
      show: false,
      frame: false,
      skipTaskbar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        // A hidden window must NOT be throttled: VAD + AudioContext run in the
        // renderer, and Chromium's visibility-based throttling can freeze the
        // audio worklet, silently stopping speech detection.
        backgroundThrottling: false,
      },
    });

    if (process.env['ELECTRON_RENDERER_URL']) {
      await this.win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/audio-host.html`);
    } else {
      await this.win.loadFile(join(__dirname, '../renderer/audio-host.html'));
    }
  }

  start(): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.webContents.send(IPC.AUDIO_HOST_START);
    this.captureActive = true;
  }

  stop(): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.webContents.send(IPC.AUDIO_HOST_STOP);
    this.captureActive = false;
  }

  /** Tell the audio host window which mic to use for the next VAD start. */
  setDevice(deviceId: string | null): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.webContents.send(IPC.AUDIO_HOST_SET_DEVICE, deviceId);
  }

  isActive(): boolean {
    return this.captureActive;
  }

  destroy(): void {
    this.win?.destroy();
    this.win = null;
    this.captureActive = false;
  }
}