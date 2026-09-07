import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@speakright/shared';
import type { AppSettings, ListeningState, PipelineStatus } from '@speakright/shared';

/**
 * Exposes a minimal, safe API surface to renderers.
 * Renderers never receive Node.js or filesystem access.
 */
const api = {
  // Settings
  getSettings: () => ipcRenderer.invoke(IPC.GET_SETTINGS) as Promise<AppSettings>,
  updateSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IPC.UPDATE_SETTINGS, patch) as Promise<AppSettings>,

  // History
  getHistory: (filter?: any) => ipcRenderer.invoke(IPC.GET_HISTORY, filter) as Promise<any[]>,
  deleteHistoryItem: (id: string) => ipcRenderer.invoke(IPC.DELETE_HISTORY_ITEM, id) as Promise<void>,
  clearHistory: () => ipcRenderer.invoke(IPC.CLEAR_HISTORY) as Promise<void>,

  // Pipeline status
  getStatus: () => ipcRenderer.invoke(IPC.GET_STATUS) as Promise<PipelineStatus>,
  toggleListening: () => ipcRenderer.invoke(IPC.TOGGLE_LISTENING) as Promise<void>,
  pauseResume: () => ipcRenderer.invoke(IPC.PAUSE_RESUME) as Promise<void>,
  onListeningState: (cb: (state: ListeningState) => void) => {
    const listener = (_e: any, state: ListeningState) => cb(state);
    ipcRenderer.on(IPC.LISTENING_STATE_CHANGED, listener);
    return () => ipcRenderer.removeListener(IPC.LISTENING_STATE_CHANGED, listener);
  },

  // Audio utterance submission (renderer → main)
  submitUtterance: (payload: {
    samples: number[];
    sampleRate: number;
    startTime: number;
    endTime: number;
  }) => ipcRenderer.invoke(IPC.AUDIO_UTTERANCE_READY, payload),

  // Voice-activity state (renderer → main): true = speech detected
  reportSpeechState: (speaking: boolean) => ipcRenderer.invoke(IPC.SPEECH_STATE_CHANGED, speaking),

  // Audio device enumeration (audio host renderer → main, cached for the UI)
  reportAudioDevices: (devices: { deviceId: string; label: string }[]) =>
    ipcRenderer.send(IPC.AUDIO_DEVICES_REPORT, devices),

  // Live streaming telemetry (main → settings window)
  onLiveTranscript: (cb: (payload: any) => void) => {
    const listener = (_e: any, data: any) => cb(data);
    ipcRenderer.on(IPC.LIVE_TRANSCRIPT, listener);
    return () => ipcRenderer.removeListener(IPC.LIVE_TRANSCRIPT, listener);
  },
  onLiveState: (cb: (payload: any) => void) => {
    const listener = (_e: any, data: any) => cb(data);
    ipcRenderer.on(IPC.LIVE_STATE, listener);
    return () => ipcRenderer.removeListener(IPC.LIVE_STATE, listener);
  },

  // Audio host command listener (main → audio host window)
  onAudioHostCommand: (channel: string, cb: (...args: any[]) => void) => {
    const listener = (_e: any, ...args: any[]) => cb(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },

  // Overlay
  onCorrection: (cb: (payload: any) => void) => {
    const listener = (_e: any, data: any) => cb(data);
    ipcRenderer.on('overlay:correction', listener);
    return () => ipcRenderer.removeListener('overlay:correction', listener);
  },
  resizeOverlay: (width: number, height: number) =>
    ipcRenderer.send(IPC.OVERLAY_RESIZE, width, height),

  // Device enumeration
  getAudioDevices: () => ipcRenderer.invoke(IPC.GET_DEVICES) as Promise<any[]>,

  // Provider health
  checkProviders: () => ipcRenderer.invoke(IPC.CHECK_PROVIDERS),
};

contextBridge.exposeInMainWorld('speakright', api);

export type SpeakRightApi = typeof api;
