import { useEffect, useState } from 'react';
import type { AppSettings, ListeningState } from '@speakright/shared';
import { ProviderSettings } from './components/ProviderConfig';
import { AudioSettings } from './components/AudioSettings';
import { OverlaySettings } from './components/OverlaySettings';
import { HistoryView } from './components/HistoryList';
import { GeneralSettings } from './components/GeneralSettings';
import { CorrectionSettings } from './components/CorrectionSettings';

type Tab = 'home' | 'general' | 'audio' | 'provider' | 'overlay' | 'correction' | 'history';

declare global {
  interface Window {
    speakright: any;
  }
}

type HealthCheck = Record<string, { ok: boolean; message: string }>;
type ProviderHealth = { stt: HealthCheck; llm: HealthCheck };

type LiveEvent =
  | { kind: 'speaking'; value: boolean; at: number }
  | { kind: 'utterance-received'; durationMs: number; at: number }
  | { kind: 'transcribing'; at: number }
  | { kind: 'transcript'; text: string; latencyMs: number; at: number }
  | { kind: 'correcting'; text: string; at: number }
  | { kind: 'correction'; hasCorrection: boolean; confidence: number; original: string; corrected: string; at: number }
  | { kind: 'skipped'; reason: string; at: number }
  | { kind: 'error'; message: string; at: number };

type LiveEntry = LiveEvent & { id: number };

let _id = 0;
function nextId(): number { return ++_id; }

function statusLabel(state: ListeningState): string {
  switch (state) {
    case 'listening': return 'Listening';
    case 'paused': return 'Paused';
    case 'error': return 'Error';
    default: return 'Stopped';
  }
}

function statusColor(state: ListeningState): string {
  switch (state) {
    case 'listening': return 'bg-green-500';
    case 'paused': return 'bg-amber-500';
    case 'error': return 'bg-red-500';
    default: return 'bg-slate-400';
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState<ListeningState>('disabled');
  const [health, setHealth] = useState<ProviderHealth | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [liveEvents, setLiveEvents] = useState<LiveEntry[]>([]);

  useEffect(() => {
    if (!window.speakright) {
      setError('Bridge not available — is this running inside the Electron app?');
      setLoading(false);
      return;
    }

    window.speakright
      .getSettings()
      .then((s: AppSettings) => setSettings(s))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));

    window.speakright.getStatus().then((st: { listening: ListeningState }) => {
      setListening(st.listening);
    });

    const unsub = window.speakright.onListeningState?.((state: ListeningState) => {
      setListening(state);
    });

    const unsubLive = window.speakright.onLiveTranscript?.((ev: LiveEvent) => {
      setLiveEvents(prev => {
        const next = [...prev, { ...ev, id: nextId() }];
        return next.slice(-50);
      });
      if (ev.kind === 'speaking') setSpeaking(ev.value);
    });

    const unsubState = window.speakright.onLiveState?.((ev: LiveEvent) => {
      if (ev.kind === 'speaking') setSpeaking(ev.value);
    });

    return () => { unsub?.(); unsubLive?.(); unsubState?.(); };
  }, []);

  const updateSettings = (patch: Partial<AppSettings>) => {
    window.speakright
      .updateSettings(patch)
      .then((s: AppSettings) => setSettings(s));
  };

  const toggleListening = () => {
    window.speakright.toggleListening().then(() => {
      window.speakright.getStatus().then((st: { listening: ListeningState }) => setListening(st.listening));
    });
  };

  const checkHealth = () => {
    window.speakright.checkProviders().then((h: ProviderHealth) => setHealth(h));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-slate-500">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-6 py-4 max-w-md text-center text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!settings) return null;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'general', label: 'General' },
    { id: 'audio', label: 'Audio' },
    { id: 'provider', label: 'Providers' },
    { id: 'overlay', label: 'Overlay' },
    { id: 'correction', label: 'Correction' },
    { id: 'history', label: 'History' },
  ];

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-800">SpeakRight</h1>
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${listening === 'listening' ? 'text-green-600' : 'text-slate-400'}`}>
            <span className={`w-2 h-2 rounded-full ${statusColor(listening)} ${listening === 'listening' ? 'animate-pulse' : ''}`} />
            {statusLabel(listening)}
          </span>
        </div>
        <nav className="max-w-4xl mx-auto px-4 flex gap-1 pb-2">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {tab === 'home' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Start listening</h2>
              <p className="text-sm text-slate-500 mb-4">
                Speak into your microphone and corrections will appear in the overlay.
              </p>
              <button
                onClick={toggleListening}
                className={`px-6 py-3 rounded-lg text-white font-medium text-sm transition-colors ${
                  listening === 'listening'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {listening === 'listening' ? 'Stop Listening' : 'Start Listening'}
              </button>
              <p className="text-xs text-slate-400 mt-3">
                Keyboard shortcut: {settings.hotkeys.toggleListening}
              </p>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-700">Live transcript</h2>
                <div className="flex items-center gap-3">
                  {speaking ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      Speaking…
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
                      <span className={`w-2 h-2 rounded-full ${listening === 'listening' ? 'bg-slate-400' : 'bg-slate-300'}`} />
                      {listening === 'listening' ? 'Listening…' : 'Stopped'}
                    </span>
                  )}
                  <button
                    onClick={() => setLiveEvents([])}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                This shows what your microphone hears — speech detection, the raw voice-to-text result, and any correction. If this stays empty while listening, your mic isn't being detected.
              </p>
              {liveEvents.length === 0 ? (
                <div className="text-sm text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-lg">
                  No speech detected yet. Start listening and speak.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {liveEvents.map(ev => (
                    <LiveEventRow key={ev.id} ev={ev} />
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-700">Providers</h2>
                <button
                  onClick={checkHealth}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Check health
                </button>
              </div>
              {health ? (
                <div className="space-y-3">
                  <HealthGroup title="Speech-to-text" checks={health.stt} />
                  <HealthGroup title="Language model" checks={health.llm} />
                </div>
              ) : (
                <p className="text-sm text-slate-400">
                  Click "Check health" to verify your STT / LLM providers are reachable.
                </p>
              )}
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">How to use</h2>
              <ol className="space-y-2 text-sm text-slate-600 list-decimal list-inside">
                <li>Click <span className="font-medium">Start Listening</span> (or press {settings.hotkeys.toggleListening}).</li>
                <li>Speak naturally into your microphone.</li>
                <li>Corrections appear in the overlay near the top of your screen.</li>
                <li>Review your history in the <span className="font-medium">History</span> tab.</li>
              </ol>
            </div>
          </div>
        )}
        {tab === 'general' && <GeneralSettings settings={settings} onUpdate={updateSettings} />}
        {tab === 'audio' && <AudioSettings settings={settings} onUpdate={updateSettings} />}
        {tab === 'provider' && <ProviderSettings settings={settings} onUpdate={updateSettings} />}
        {tab === 'overlay' && <OverlaySettings settings={settings} onUpdate={updateSettings} />}
        {tab === 'correction' && <CorrectionSettings settings={settings} onUpdate={updateSettings} />}
        {tab === 'history' && <HistoryView />}
      </main>
    </div>
  );
}

function HealthGroup({ title, checks }: { title: string; checks: HealthCheck }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{title}</h3>
      <div className="space-y-2">
        {Object.entries(checks).map(([name, h]) => (
          <div key={name} className="flex items-center justify-between text-sm">
            <span className="text-slate-600">{name}</span>
            <span className={`inline-flex items-center gap-1.5 ${h.ok ? 'text-green-600' : 'text-red-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${h.ok ? 'bg-green-500' : 'bg-red-500'}`} />
              {h.ok ? 'Ready' : h.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtTime(at: number): string {
  const d = new Date(at);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function LiveEventRow({ ev }: { ev: LiveEntry }) {
  const [time, label] = eventContent(ev);
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-slate-400 text-xs pt-0.5 whitespace-nowrap tabular-nums">{time}</span>
      <span className="text-slate-700 min-w-0">
        {label.prefix}
        {label.text && (
          <span className={`font-medium break-words ${label.tone === 'green' ? 'text-green-700' : label.tone === 'red' ? 'text-red-600' : 'text-slate-800'}`}>
            {label.text}
          </span>
        )}
      </span>
    </div>
  );
}

function eventContent(ev: LiveEvent): [string, { prefix: string; text?: string; tone?: 'green' | 'red' | 'default' }] {
  switch (ev.kind) {
    case 'speaking':
      return [fmtTime(ev.at), ev.value
        ? { prefix: '🎤 ', text: 'Speech detected — recording…', tone: 'green' }
        : { prefix: ' ', text: 'Silence' }];
    case 'utterance-received':
      return [fmtTime(ev.at), { prefix: '📥 ', text: `Utterance captured (${(ev.durationMs / 1000).toFixed(1)}s)` }];
    case 'transcribing':
      return [fmtTime(ev.at), { prefix: '⚙️ ', text: 'Converting speech to text…' }];
    case 'transcript':
      return [fmtTime(ev.at), { prefix: '📝 ', text: ev.text, tone: 'default' }];
    case 'correcting':
      return [fmtTime(ev.at), { prefix: '🧠 ', text: 'Running grammar check…' }];
    case 'correction':
      if (!ev.hasCorrection) {
        return [fmtTime(ev.at), { prefix: '✅ ', text: 'Looks correct — no fix needed', tone: 'green' }];
      }
      return [fmtTime(ev.at), { prefix: '✨ ', text: `${ev.original} → ${ev.corrected}`, tone: 'green' }];
    case 'skipped':
      return [fmtTime(ev.at), { prefix: '⏭️ ', text: ev.reason }];
    case 'error':
      return [fmtTime(ev.at), { prefix: '⚠️ ', text: ev.message, tone: 'red' }];
  }
}
