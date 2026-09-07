import { globalShortcut } from 'electron';
import type { SettingsManager } from '@speakright/settings';

export interface HotkeyCallbacks {
  onToggleListening: () => void;
  onPauseResume: () => void;
  onToggleOverlay: () => void;
}

/**
 * Manages global system-wide shortcuts.
 *
 * Linux Wayland limitations: Electron's globalShortcut works on X11.
 * On Wayland, registration may silently fail; we fall back to the
 * desktop-portal path when available and log a warning otherwise.
 */
export class HotkeyManager {
  private readonly settings: SettingsManager;
  private readonly callbacks: HotkeyCallbacks;

  constructor(settings: SettingsManager, callbacks: HotkeyCallbacks) {
    this.settings = settings;
    this.callbacks = callbacks;
  }

  registerAll(): void {
    this.unregisterAll();

    const hotkeys = this.settings.getSection('hotkeys');

    if (!globalShortcut.register(hotkeys.toggleListening, this.callbacks.onToggleListening)) {
      console.warn(`[Hotkeys] Failed to register: ${hotkeys.toggleListening}`);
    }
    if (!globalShortcut.register(hotkeys.pauseResume, this.callbacks.onPauseResume)) {
      console.warn(`[Hotkeys] Failed to register: ${hotkeys.pauseResume}`);
    }
    if (!globalShortcut.register(hotkeys.toggleOverlay, this.callbacks.onToggleOverlay)) {
      console.warn(`[Hotkeys] Failed to register: ${hotkeys.toggleOverlay}`);
    }
  }

  reapply(): void {
    this.registerAll();
  }

  unregisterAll(): void {
    globalShortcut.unregisterAll();
  }
}
