import { Menu, Tray } from 'electron';

export type ListeningState = 'disabled' | 'listening' | 'paused' | 'error';

export interface TrayCallbacks {
  onToggleListening: () => void;
  onPauseResume: () => void;
  onOpenSettings: () => void;
  onQuit: () => void;
}

/**
 * System tray icon with status indicators and context menu.
 */
export class TrayController {
  private tray: Tray | null = null;
  private state: ListeningState = 'disabled';
  private readonly callbacks: TrayCallbacks;

  constructor(callbacks: TrayCallbacks) {
    this.callbacks = callbacks;
  }

  create(): void {
    const icon = this.createTrayIcon();
    this.tray = new Tray(icon);
    this.tray.setToolTip('SpeakRight — Personal English Coach');
    this.updateMenu();
  }

  setState(state: ListeningState): void {
    this.state = state;
    this.updateMenu();
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }

  private updateMenu(): void {
    if (!this.tray) return;

    const statusLabel = this.getStatusLabel();

    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: statusLabel, enabled: false },
      { type: 'separator' },
      {
        label: this.state === 'listening' ? 'Stop Listening' : 'Start Listening',
        click: () => this.callbacks.onToggleListening(),
      },
      {
        label: 'Pause / Resume',
        click: () => this.callbacks.onPauseResume(),
      },
      { type: 'separator' },
      { label: 'Settings...', click: () => this.callbacks.onOpenSettings() },
      { type: 'separator' },
      { label: 'Quit', click: () => this.callbacks.onQuit() },
    ]));
  }

  private getStatusLabel(): string {
    const map: Record<ListeningState, string> = {
      disabled: '● Disabled',
      listening: '● Listening (green)',
      paused: '● Paused',
      error: '● Error',
    };
    return map[this.state];
  }

  private createTrayIcon(): Electron.NativeImage {
    // Use a simple 16x16 emissive icon to represent the app
    const { nativeImage } = require('electron');
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="7" fill="${this.iconColor()}" opacity="0.9"/>
      </svg>
    `;
    const image = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
    return image;
  }

  private iconColor(): string {
    const map: Record<ListeningState, string> = {
      disabled: '#9ca3af',
      listening: '#22c55e',
      paused: '#f59e0b',
      error: '#ef4444',
    };
    return map[this.state];
  }
}
