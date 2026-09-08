import { useEffect, useState } from 'react';
import type { AppSettings, ListeningState } from '@speakright/shared';
import { ProviderSettings } from './components/ProviderConfig';
import { AudioSettings } from './components/AudioSettings';
import { OverlaySettings } from './components/OverlaySettings';
import { HistoryView } from './components/HistoryList';
import { GeneralSettings } from './components/GeneralSettings';
import { CorrectionSettings } from './components/CorrectionSettings';

type Tab = 'home' | 'queue' | 'general' | 'audio' | 'provider' | 'overlay' | 'correction' | 'history';

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
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [queueInfo, setQueueInfo] = useState<{
    state: string;
    current: { original: string; corrected?: string } | null;
    pending: { original: string; corrected?: string }[];
  }>({ state: 'empty', current: null, pending: [] });

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

    window.speakright.getOverlayVisible?.().then(setOverlayVisible);

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

    // Poll the display queue so the Home tab reflects what's waiting to show.
    const pollQueue = () => window.speakright.getQueue?.().then(setQueueInfo);
    pollQueue();
    const queueTimer = setInterval(pollQueue, 1000);

    return () => { unsub?.(); unsubLive?.(); unsubState?.(); clearInterval(queueTimer); };
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

  const toggleOverlay = () => {
    window.speakright.setOverlayVisible(!overlayVisible).then(setOverlayVisible);
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

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'home', label: 'Home' },
    { id: 'queue', label: 'Queue', count: queueInfo.pending.length + (queueInfo.current ? 1 : 0) },
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
              {t.count !== undefined && t.count > 0 && (
                <span
                  className={`ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-[1.25rem] px-1 rounded-full text-[11px] font-semibold ${
                    tab === t.id ? 'bg-white/25 text-white' : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {t.count}
                </span>
              )}
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
              <div className="flex flex-wrap gap-2">
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
                <button
                  onClick={toggleOverlay}
                  className={`px-6 py-3 rounded-lg font-medium text-sm transition-colors border ${
                    overlayVisible
                      ? 'text-slate-700 border-slate-300 hover:bg-slate-100'
                      : 'text-blue-600 border-blue-300 bg-blue-50 hover:bg-blue-100'
                  }`}
                  title="Hides the always-on-top window without stopping listening or the queue"
                >
                  {overlayVisible ? 'Hide Overlay' : 'Show Overlay'}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-3">
                Keyboard shortcut: {settings.hotkeys.toggleListening}
                {!overlayVisible && (
                  <span className="text-amber-600 block mt-1">
                    Overlay hidden — listening and the queue continue; nothing is shown until you reveal it again.
                  </span>
                )}
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
        {tab === 'queue' && (
          <QueueTab queueInfo={queueInfo} overlayVisible={overlayVisible} onToggleOverlay={toggleOverlay} />
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

function QueueTab({ queueInfo, overlayVisible, onToggleOverlay }: {
  queueInfo: { state: string; current: { original: string; corrected?: string } | null; pending: { original: string; corrected?: string }[] };
  overlayVisible: boolean;
  onToggleOverlay: () => void;
}) {
  const total = queueInfo.pending.length + (queueInfo.current ? 1 : 0);
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-slate-700">Display queue</h2>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
            {total === 0 ? 'Empty' : `${total} item${total === 1 ? '' : 's'} in queue`}
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Corrections play one at a time here, each for its configured display duration. While the overlay is hidden the queue pauses, so everything spoken is still captured and replays in order when you show it again.
        </p>
        {!overlayVisible && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 flex items-center justify-between gap-3">
            <span>Overlay is hidden — the queue is paused and accumulating.</span>
            <button onClick={onToggleOverlay} className="text-xs font-semibold text-amber-800 hover:text-amber-900 whitespace-nowrap">
              Show Overlay
            </button>
          </div>
        )}
        {queueInfo.current || queueInfo.pending.length > 0 ? (
          <div className="space-y-3">
            {queueInfo.current && (
              <QueueItem label="Now showing" item={queueInfo.current} highlight />
            )}
            {queueInfo.pending.map((item, i) => (
              <QueueItem key={i} label={i === 0 ? 'Next' : `#${i + 1}`} item={item} />
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-lg">
            Nothing to display yet. Start listening and speak.
          </div>
        )}
      </div>
    </div>
  );
}

function QueueItem({ label, item, highlight }: { label: string; item: { original: string; corrected?: string }; highlight?: boolean }) {
  const corrected = item.corrected && item.corrected !== item.original;
  return (
    <div className={`rounded-lg border px-3 py-2 ${highlight ? 'border-green-300 bg-green-50' : 'border-slate-200'}`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${highlight ? 'text-green-600' : 'text-slate-400'}`}>
        {label}
      </div>
      <div className="text-sm text-slate-700 line-through decoration-red-400 decoration-1 leading-snug">{item.original}</div>
      {corrected && (
        <div className="text-sm font-medium text-green-700 mt-0.5 leading-snug">{item.corrected}</div>
      )}
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
