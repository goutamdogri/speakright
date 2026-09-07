import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { IPC } from '@speakright/shared';
import type { AppSettings, DisplayCorrection, ListeningState } from '@speakright/shared';
import type { SettingsManager } from '@speakright/settings';

/**
 * Manages the always-on-top overlay window that displays corrections.
 * The overlay is borderless, transparent, and draggable.
 */
export class OverlayController {
  private win: BrowserWindow | null = null;
  private readonly settings: SettingsManager;
  private readonly position: { x: number; y: number } = { x: -1, y: -1 };
  private visible = false;

  constructor(settings: SettingsManager) {
    this.settings = settings;
  }

  createWindow(): void {
    const overlay = this.settings.getSection('overlay');

    this.win = new BrowserWindow({
      width: overlay.width,
      height: 200,
      x: overlay.position.x >= 0 ? overlay.position.x : undefined,
      y: overlay.position.y >= 0 ? overlay.position.y : undefined,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    this.win.setAlwaysOnTop(true, 'screen-saver');
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.win.setIgnoreMouseEvents(true, { forward: true });

    // Position top-right by default
    if (overlay.position.x < 0) {
      this.positionTopRight();
    }

    this.win.on('closed', () => { this.win = null; });

    if (process.env['ELECTRON_RENDERER_URL']) {
      void this.win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay.html`);
    } else {
      void this.win.loadFile(join(__dirname, '../renderer/overlay.html'));
    }

    // Apply opacity
    this.win.setOpacity(overlay.opacity);

    // Listen for position changes from the renderer drag
    this.win.on('move', () => {
      if (this.win) {
        const [x, y] = this.win.getPosition();
        this.position.x = x;
        this.position.y = y;
      }
    });
  }

  show(correction: DisplayCorrection): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.showInactive();
    this.win.setIgnoreMouseEvents(true, { forward: true });
    this.win.webContents.send('overlay:correction', correction);
    this.visible = true;
  }

  hide(): void {
    if (this.win) this.win.hide();
    this.visible = false;
  }

  /** Tell the overlay renderer the current listening state (to render an idle hint). */
  broadcastListening(state: ListeningState): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.webContents.send(IPC.LISTENING_STATE_CHANGED, state);
  }

  toggle(): void {
    if (this.visible) this.hide();
    else {
      this.win?.showInactive();
      this.visible = true;
    }
  }

  /** Auto-size the transparent window to fit its content (top-right anchor keeps height growing downward). */
  resize(width: number, height: number): void {
    if (!this.win || this.win.isDestroyed()) return;
    const overlay = this.settings.getSection('overlay');
    const w = Math.max(80, Math.min(1200, Math.round(width) || overlay.width));
    const h = Math.max(40, Math.round(height));
    const [x] = this.win.getPosition();
    const display = screen.getDisplayMatching(this.win.getBounds());
    const maxY = display.workArea.y + display.workArea.height;
    let y = this.position.y;
    if (y + h > maxY) y = Math.max(display.workArea.y, maxY - h);
    this.win.setBounds({ x, y, width: w, height: h });
    this.position.y = y;
  }

  applySettings(settings: AppSettings): void {
    if (!this.win) return;
    this.win.setOpacity(settings.overlay.opacity);
    if (settings.overlay.position.x >= 0) {
      this.win.setPosition(settings.overlay.position.x, settings.overlay.position.y);
    }
  }

  destroy(): void {
    this.win?.destroy();
    this.win = null;
  }

  getPosition(): { x: number; y: number } {
    return { ...this.position };
  }

  savePosition(): void {
    const settings = this.settings.getAll();
    settings.overlay.position = { ...this.position };
    this.settings.update({ overlay: settings.overlay });
  }

  private positionTopRight(): void {
    const display = screen.getPrimaryDisplay();
    const { workArea } = display;
    const overlay = this.settings.getSection('overlay');
    const x = workArea.x + workArea.width - overlay.width - 20;
    const y = workArea.y + 20;
    this.win?.setPosition(x, y);
    this.position.x = x;
    this.position.y = y;
  }
}
