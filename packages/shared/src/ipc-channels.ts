export const IPC = {
  // Pipeline control
  TOGGLE_LISTENING: 'pipeline:toggle-listening',
  PAUSE_RESUME: 'pipeline:pause-resume',
  GET_STATUS: 'pipeline:get-status',
  LISTENING_STATE_CHANGED: 'pipeline:listening-state-changed',

  // Audio pipeline
  START_CAPTURE: 'audio:start-capture',
  STOP_CAPTURE: 'audio:stop-capture',
  GET_DEVICES: 'audio:get-devices',
  AUDIO_DEVICES_REPORT: 'audio:devices-report',
  AUDIO_UTTERANCE_READY: 'audio:utterance-ready',
  AUDIO_HOST_START: 'audio-host:start',
  AUDIO_HOST_STOP: 'audio-host:stop',
  AUDIO_HOST_SET_DEVICE: 'audio-host:set-device',
  SPEECH_STATE_CHANGED: 'audio:speech-state-changed',

  // Live streaming telemetry (main → settings window)
  LIVE_TRANSCRIPT: 'live:transcript',
  LIVE_STATE: 'live:state',

  // History
  GET_HISTORY: 'history:get',
  GET_HISTORY_BY_ID: 'history:get-by-id',
  DELETE_HISTORY_ITEM: 'history:delete-item',
  CLEAR_HISTORY: 'history:clear',

  // Settings
  GET_SETTINGS: 'settings:get',
  UPDATE_SETTINGS: 'settings:update',
  SETTINGS_CHANGED: 'settings:changed',

  // Overlay
  SHOW_CORRECTION: 'overlay:show-correction',
  SKIP_CORRECTION: 'overlay:skip',
  PAUSE_QUEUE: 'overlay:pause-queue',
  RESUME_QUEUE: 'overlay:resume-queue',
  OVERLAY_POSITION_CHANGED: 'overlay:position-changed',
  OVERLAY_RESIZE: 'overlay:resize',

  // Provider health
  CHECK_PROVIDERS: 'health:check',
  PROVIDER_UNAVAILABLE: 'health:provider-unavailable',

  // Sessions
  START_SESSION: 'session:start',
  END_SESSION: 'session:end',
} as const;

export type IPCChannel = (typeof IPC)[keyof typeof IPC];
