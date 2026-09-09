import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppSettings, ListeningState } from '@speakright/shared';
import { ProviderSettings } from './components/ProviderConfig';
import { AudioSettings } from './components/AudioSettings';
import { OverlaySettings } from './components/OverlaySettings';
import { HistoryView } from './components/HistoryList';
import { GeneralSettings, GhostButton } from './components/GeneralSettings';
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

function statusDot(state: ListeningState): string {
  switch (state) {
    case 'listening': return 'bg-[var(--accent)]';
    case 'paused': return 'bg-[var(--warn)]';
    case 'error': return 'bg-[var(--danger)]';
    default: return 'bg-[var(--muted)]';
  }
}

type QueueSnapshot = {
  state: string;
  current: { original: string; corrected?: string } | null;
  pending: { original: string; corrected?: string }[];
};

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
  const [queueInfo, setQueueInfo] = useState<QueueSnapshot>({ state: 'empty', current: null, pending: [] });
  const [maximized, setMaximized] = useState(false);

  // Apply the chosen theme to the document root immediately when it changes.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings?.general.theme === 'dark');
  }, [settings?.general.theme]);

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

    const unsubMax = window.speakright.onMaximizeChange?.(setMaximized);

    // Poll the display queue so the Queue tab and badge stay current.
    const pollQueue = () => window.speakright.getQueue?.().then(setQueueInfo);
    pollQueue();
    const queueTimer = setInterval(pollQueue, 1000);

    return () => { unsub?.(); unsubLive?.(); unsubState?.(); unsubMax?.(); clearInterval(queueTimer); };
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

  const handleMinimize = () => window.speakright.minimizeWindow?.();
  const handleToggleMaximize = () => window.speakright.toggleMaximizeWindow?.();
  const handleClose = () => window.speakright.closeWindow?.();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-sm text-[var(--muted)]">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="bg-[var(--surface)] border border-red-200 text-red-700 rounded-xl px-6 py-5 max-w-md text-center text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!settings) return null;

  const queueCount = queueInfo.pending.length + (queueInfo.current ? 1 : 0);

  const workspaceTabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'home', label: 'Home' },
    { id: 'queue', label: 'Queue', count: queueCount },
    { id: 'history', label: 'History' },
  ];

  const settingsTabs: { id: Tab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'audio', label: 'Audio' },
    { id: 'provider', label: 'Providers' },
    { id: 'overlay', label: 'Overlay' },
    { id: 'correction', label: 'Correction' },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Custom title bar: brand + window controls, matches the app design. */}
      <div className="drag-region flex h-9 shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--surface)]">
        <span className="flex items-baseline gap-0.5 pl-4 select-none">
          <span className="text-[14px] font-serif italic tracking-tight text-[var(--ink)]">SpeakRight</span>
          <span className="text-[14px] font-serif italic text-[var(--accent)]">.</span>
        </span>
        <div className="flex h-full items-stretch">
          <WindowControl label="Minimize" onClick={handleMinimize}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M1.5 6.5h9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            </svg>
          </WindowControl>
          <WindowControl label={maximized ? 'Restore' : 'Maximize'} onClick={handleToggleMaximize}>
            {maximized ? (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <rect x="1.5" y="3" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
                <path d="M4 1.5h6.5V8" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <rect x="2" y="2" width="8" height="8" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            )}
          </WindowControl>
          <WindowControl label="Close" onClick={handleClose} close>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </WindowControl>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 flex flex-col bg-[var(--surface)] border-r border-[var(--line)]">
          <nav className="flex-1 px-3 pt-4 pb-2 space-y-1 overflow-y-auto">
          <p className="nav-group-label">Workspace</p>
          {workspaceTabs.map(t => (
            <NavItem
              key={t.id}
              active={tab === t.id}
              count={t.count}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </NavItem>
          ))}

          <p className="nav-group-label">Settings</p>
          {settingsTabs.map(t => (
            <NavItem key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </NavItem>
          ))}
        </nav>

        {/* Session status, always in view. */}
        <div className="mx-3 mb-5 rounded-xl border border-[var(--line)] bg-[var(--field)] px-3.5 py-3 sticky bottom-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${statusDot(listening)} ${listening === 'listening' ? 'animate-pulse' : ''}`} />
            <span className={`text-[13px] font-medium ${listening === 'listening' ? 'text-[var(--ink)]' : 'text-[var(--muted)]'}`}>
              {statusLabel(listening)}
            </span>
          </div>
          <p className="text-[11px] text-[var(--muted)] mt-1.5 leading-relaxed">
            {listening === 'listening'
              ? 'Say something — corrections appear in the overlay.'
              : `Start listening with `}
            {listening !== 'listening' && <span className="kbd">{settings.hotkeys.toggleListening}</span>}
          </p>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0 h-full overflow-y-auto">
        <main className="px-10 py-7">
          {tab === 'home' && (
            <HomeView
              settings={settings}
              listening={listening}
              speaking={speaking}
              liveEvents={liveEvents}
              health={health}
              overlayVisible={overlayVisible}
              onToggleListening={toggleListening}
              onToggleOverlay={toggleOverlay}
              onCheckHealth={checkHealth}
              onClearLive={() => setLiveEvents([])}
            />
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
      </div>
    </div>
  );
}

function WindowControl({
  label,
  onClick,
  close,
  children,
}: {
  label: string;
  onClick: () => void;
  close?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex w-12 items-center justify-center text-[var(--muted)] transition-colors ${
        close
          ? 'hover:bg-[var(--danger)] hover:text-white'
          : 'hover:bg-[var(--hover)] hover:text-[var(--ink)]'
      }`}
    >
      {children}
    </button>
  );
}

function NavItem({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count?: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-[7px] text-left text-[13.5px] transition-colors ${
        active
          ? 'bg-[var(--ink)] font-medium text-[var(--bg)]'
          : 'text-[var(--ink-soft)] hover:bg-[var(--hover)] hover:text-[var(--ink)]'
      }`}
    >
      <span>{children}</span>
      {count !== undefined && count > 0 && (
        <span
          className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none ${
            active ? 'bg-[var(--bg)]/25 text-[var(--bg)]' : 'bg-[var(--line)] text-[var(--ink-soft)]'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function HomeView(props: {
  settings: AppSettings;
  listening: ListeningState;
  speaking: boolean;
  liveEvents: LiveEntry[];
  health: ProviderHealth | null;
  overlayVisible: boolean;
  onToggleListening: () => void;
  onToggleOverlay: () => void;
  onCheckHealth: () => void;
  onClearLive: () => void;
}) {
  const {
    settings, listening, speaking, liveEvents, health,
    overlayVisible, onToggleListening, onToggleOverlay, onCheckHealth, onClearLive,
  } = props;
  return (
    <div className="space-y-5 page-enter">
      {/* Hero */}
      <section className="bg-[var(--surface)] rounded-2xl border border-[var(--line)] px-8 py-9">
        <p className="text-sm text-[var(--muted)] mb-1.5">
          {settings.general.language === 'hi' ? 'अपनी अंग्रेज़ी पर ध्यान दें' : 'Real-time spoken English coaching'}
        </p>
        <h2 className="font-serif text-[32px] leading-tight tracking-tight text-[var(--ink)]">
          {listening === 'listening' ? 'You’re being heard.' : 'Speak more clearly.'}
        </h2>
        <p className="text-[15px] text-[var(--ink-soft)] mt-2 max-w-xl leading-relaxed">
          {listening === 'listening'
            ? 'Every sentence you say is checked as you go. Corrections surface in the overlay; the summary stays here.'
            : 'Start listening, speak naturally, and SpeakRight will point out grammar, structure, and word-choice slips as they happen.'}
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            onClick={onToggleListening}
            className={`px-6 py-3 rounded-xl text-[15px] font-semibold text-white transition-colors ${
              listening === 'listening'
                ? 'bg-[var(--danger)] hover:brightness-90'
                : 'bg-[var(--accent)] hover:brightness-90'
            }`}
          >
            {listening === 'listening' ? 'Stop listening' : 'Start listening'}
          </button>
          <GhostButton onClick={onToggleOverlay} className="px-6 py-3">
            {overlayVisible ? 'Hide overlay' : 'Show overlay'}
          </GhostButton>
          <span className="text-[13px] text-[var(--muted)]">
            or press <span className="kbd">{settings.hotkeys.toggleListening}</span>
          </span>
        </div>
        {!overlayVisible && (
          <p className="mt-4 text-[13px] text-[var(--warn)]">
            The overlay is hidden — guidance keeps queueing and will replay when you show it again.
          </p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Live transcript */}
        <section className="bg-[var(--surface)] rounded-2xl border border-[var(--line)] p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[15px] font-semibold tracking-tight text-[var(--ink)]">Live transcript</h3>
            <button
              onClick={onClearLive}
              className="text-[13px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
            >
              Clear
            </button>
          </div>
          <p className="text-[13px] text-[var(--muted)] mb-4">
            What your microphone heard, and whether anything needed fixing.
          </p>
          {liveEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--line-strong)] py-10 text-center text-sm text-[var(--muted)]">
              {speaking ? 'Listening…' : 'No speech detected yet. Start listening and speak.'}
            </div>
          ) : (
            <div className="divide-y divide-[var(--line)] max-h-72 overflow-y-auto">
              {liveEvents.map(ev => (
                <LiveEventRow key={ev.id} ev={ev} />
              ))}
            </div>
          )}
        </section>

        {/* Providers */}
        <section className="bg-[var(--surface)] rounded-2xl border border-[var(--line)] p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[15px] font-semibold tracking-tight text-[var(--ink)]">Providers</h3>
            <button
              onClick={onCheckHealth}
              className="text-[13px] font-medium text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
            >
              Check health
            </button>
          </div>
          <p className="text-[13px] text-[var(--muted)] mb-4">
            Speech-to-text and language-model connections.
          </p>
          {health ? (
            <div className="space-y-4">
              <HealthGroup title="Speech-to-text" checks={health.stt} />
              <HealthGroup title="Language model" checks={health.llm} />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--line-strong)] py-10 text-center text-sm text-[var(--muted)]">
              Run a check to verify your STT / LLM providers are reachable.
            </div>
          )}
        </section>
      </div>

      {/* How it works */}
      <section className="bg-[var(--surface)] rounded-2xl border border-[var(--line)] px-8 py-6">
        <h3 className="text-[15px] font-semibold tracking-tight text-[var(--ink)] mb-4">How it works</h3>
        <ol className="grid gap-6 sm:grid-cols-3">
          <Step n="01" title="Listen" text="Your microphone feeds SpeakRight through a local voice-activity detector." />
          <Step n="02" title="Check" text="Each sentence is transcribed and reviewed in your spoken context." />
          <Step n="03" title="Learn" text="Fixes appear in the overlay and are saved to History for later review." />
        </ol>
      </section>
    </div>
  );
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <li>
      <div className="font-serif italic text-2xl text-[var(--accent)]">{n}</div>
      <div className="text-sm font-semibold text-[var(--ink)] mt-1.5">{title}</div>
      <p className="text-[13px] text-[var(--ink-soft)] leading-relaxed mt-1">{text}</p>
    </li>
  );
}

function HealthGroup({ title, checks }: { title: string; checks: HealthCheck }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] mb-2">{title}</h4>
      <div className="divide-y divide-[var(--line)]">
        {Object.entries(checks).map(([name, h]) => (
          <div key={name} className="flex items-center justify-between py-2 text-sm">
            <span className="text-[var(--ink-soft)]">{name}</span>
            <span className={`inline-flex items-center gap-2 font-medium ${h.ok ? 'text-[var(--accent-strong)]' : 'text-[var(--danger)]'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${h.ok ? 'bg-[var(--accent)]' : 'bg-[var(--danger)]'}`} />
              {h.ok ? 'Ready' : h.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QueueTab(props: {
  queueInfo: QueueSnapshot;
  overlayVisible: boolean;
  onToggleOverlay: () => void;
}) {
  const { queueInfo, overlayVisible, onToggleOverlay } = props;
  const total = queueInfo.pending.length + (queueInfo.current ? 1 : 0);
  return (
    <div className="space-y-5 page-enter">
      <section className="bg-[var(--surface)] rounded-2xl border border-[var(--line)] p-7">
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="text-[15px] font-semibold tracking-tight text-[var(--ink)]">Pending corrections</h2>
          <span className="text-[13px] text-[var(--muted)] tabular-nums">
            {total === 0 ? 'Empty — nothing queued' : `${total} ${total === 1 ? 'item' : 'items'} waiting`}
          </span>
        </div>
        <p className="text-[13px] text-[var(--muted)] mb-5">
          Each item plays on the overlay for its display duration. While the overlay is hidden, the queue pauses and everything you say still accumulates here.
        </p>

        {!overlayVisible && (
          <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-[var(--warn)]/30 bg-[var(--warn-soft)] px-4 py-3 text-sm text-[var(--warn)]">
            <span>Overlay hidden — the queue is paused and accumulating.</span>
            <button onClick={onToggleOverlay} className="shrink-0 font-semibold text-[var(--ink)] hover:text-[var(--accent-strong)] transition-colors">
              Show overlay
            </button>
          </div>
        )}

        {queueInfo.current || queueInfo.pending.length > 0 ? (
          <div className="space-y-2.5">
            {queueInfo.current && (
              <div className="rounded-xl border border-transparent bg-[var(--accent-soft)]">
                <QueueItem label="Now showing" item={queueInfo.current} />
              </div>
            )}
            {queueInfo.pending.map((item, i) => (
              <div key={i} className="rounded-xl border border-[var(--line)]">
                <QueueItem label={i === 0 ? 'Next' : `#${i + 1}`} item={item} />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--line-strong)] py-10 text-center text-sm text-[var(--muted)]">
            Nothing to display yet. Start listening and speak.
          </div>
        )}
      </section>
    </div>
  );
}

function QueueItem({ label, item }: { label: string; item: { original: string; corrected?: string } }) {
  const corrected = item.corrected && item.corrected !== item.original;
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</span>
        {label === 'Now showing' && (
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--accent)]">on screen</span>
        )}
      </div>
      <div className="text-[15px] text-[var(--muted)] line-through decoration-red-400 decoration-1 leading-snug break-words">
        {item.original}
      </div>
      {corrected && (
        <div className="text-[15px] font-medium text-[var(--ink)] mt-1 leading-snug break-words">
          {item.corrected}
        </div>
      )}
    </div>
  );
}

function fmtTime(at: number): string {
  const d = new Date(at);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function LiveEventRow({ ev }: { ev: LiveEntry }) {
  const [time, content] = eventContent(ev);
  return (
    <div className="flex items-baseline gap-3 py-2.5">
      <span className="w-12 shrink-0 pt-0.5 text-right font-mono text-[11px] text-[var(--muted)] tabular-nums">
        {time}
      </span>
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${content.dot}`} />
        <span className={`min-w-0 break-words leading-snug ${content.textClass}`}>
          {content.text}
        </span>
      </span>
    </div>
  );
}

function eventContent(
  ev: LiveEvent,
): [string, { text: string; dot: string; textClass: string }] {
  const gray = 'bg-[var(--line-strong)]';
  const green = 'bg-[var(--accent)]';
  const red = 'bg-[var(--danger)]';
  switch (ev.kind) {
    case 'speaking':
      return [fmtTime(ev.at), ev.value
        ? { text: 'Speech detected — recording…', dot: green, textClass: 'text-[var(--ink)] font-medium' }
        : { text: 'Silence', dot: gray, textClass: 'text-[var(--muted)]' }];
    case 'utterance-received':
      return [fmtTime(ev.at), { text: `Utterance captured (${(ev.durationMs / 1000).toFixed(1)}s)`, dot: gray, textClass: 'text-[var(--ink-soft)]' }];
    case 'transcribing':
      return [fmtTime(ev.at), { text: 'Converting speech to text…', dot: gray, textClass: 'text-[var(--ink-soft)]' }];
    case 'transcript':
      return [fmtTime(ev.at), { text: ev.text, dot: gray, textClass: 'text-[var(--ink)]' }];
    case 'correcting':
      return [fmtTime(ev.at), { text: 'Running grammar check…', dot: gray, textClass: 'text-[var(--ink-soft)]' }];
    case 'correction':
      if (!ev.hasCorrection) {
        return [fmtTime(ev.at), { text: 'Looks correct — no fix needed', dot: green, textClass: 'text-[var(--ink-soft)]' }];
      }
      return [fmtTime(ev.at), { text: `${ev.original} → ${ev.corrected}`, dot: green, textClass: 'text-[var(--ink)]' }];
    case 'skipped':
      return [fmtTime(ev.at), { text: ev.reason, dot: gray, textClass: 'text-[var(--muted)]' }];
    case 'error':
      return [fmtTime(ev.at), { text: ev.message, dot: red, textClass: 'text-[var(--danger)]' }];
  }
}