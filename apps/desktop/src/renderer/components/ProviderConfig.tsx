import { useEffect, useState } from 'react';
import { Section, Field, inputCls, GhostButton, SolidButton } from './GeneralSettings';
import type { AppSettings, CloudProvider, SecretStatus } from '@speakright/shared';
import { DEFAULT_CORRECTION_PROMPT } from '@speakright/shared';

interface Props {
  settings: AppSettings;
  onUpdate: (patch: Partial<AppSettings>) => void;
}

const STT_OPTIONS = [
  { value: 'local-whisper', label: 'Local Whisper (whisper.cpp) — Offline' },
  { value: 'sherpa-onnx', label: 'Sherpa-ONNX Streaming Zipformer — Offline' },
  { value: 'groq', label: 'Groq Whisper (Cloud)' },
  { value: 'openai', label: 'OpenAI Whisper (Cloud)' },
  { value: 'gemini', label: 'Google Gemini (Cloud)' },
] as const;

const LLM_OPTIONS = [
  { value: 'ollama', label: 'Ollama (Local Model)' },
  { value: 'groq', label: 'Groq LLM (Cloud)' },
  { value: 'openai', label: 'OpenAI (Cloud)' },
  { value: 'gemini', label: 'Google Gemini (Cloud)' },
] as const;

const WHISPER_MODEL_OPTIONS = ['base', 'small', 'medium', 'large'] as const;
const CLOUD_PROVIDERS: CloudProvider[] = ['groq', 'openai', 'gemini'];

/** Editable system prompt for the LLM correction task. */
function CorrectionPromptSection({ promptValue, onApply }: { promptValue: string; onApply: (value: string) => void }) {
  const [draft, setDraft] = useState(promptValue);
  const [saved, setSaved] = useState(false);

  // Sync the draft when the prompt changes from elsewhere (restore, load).
  useEffect(() => { setDraft(promptValue); }, [promptValue]);

  const apply = (value: string) => {
    onApply(value);
    setDraft(value);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const isCustom = promptValue !== DEFAULT_CORRECTION_PROMPT;

  return (
    <Section title="Correction prompt">
      <p className="text-[13px] text-[var(--ink-soft)] -mt-2 mb-4 leading-relaxed">
        The system prompt sent to the active LLM on every correction. Edits apply to the very next correction —
        no restart required. Restore to return to the built-in English-coach prompt.
      </p>
      <Field label="System prompt">
        <textarea
          className={`${inputCls} resize-y min-h-[240px] font-mono text-[12px] leading-relaxed`}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          spellCheck={false}
        />
      </Field>
      <div className="flex items-center gap-2.5 mt-2">
        <SolidButton disabled={draft === promptValue} onClick={() => apply(draft)}>
          Apply &amp; save
        </SolidButton>
        <GhostButton
          disabled={!isCustom && draft === DEFAULT_CORRECTION_PROMPT}
          onClick={() => apply(DEFAULT_CORRECTION_PROMPT)}
        >
          Restore default
        </GhostButton>
        {saved && <span className="text-[13px] text-[var(--accent-strong)]">Saved — active now.</span>}
      </div>
    </Section>
  );
}

const DEFAULT_STT_MODEL: Record<string, string> = {
  'local-whisper': 'base',
  'sherpa-onnx': 'streaming-zipformer-en',
  groq: 'whisper-large-v3-turbo',
  openai: 'gpt-4o-mini-transcribe',
  gemini: 'gemini-2.5-flash',
};

const DEFAULT_LLM_MODEL: Record<string, string> = {
  ollama: 'llama3.1',
  groq: 'qwen/qwen3.6-27b',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.5-flash',
};

type HealthCheck = Record<string, { ok: boolean; message: string }>;

interface CloudPanelProps {
  provider: CloudProvider;
  kind: 'stt' | 'llm';
  model: string;
  onModelChange: (value: string) => void;
}

/**
 * API-key entry + model picker for a cloud provider.
 *
 * The key is stored by the main process (OS-keychain-encrypted, or env/.env
 * fallback). The renderer can only read a masked status — never the raw key.
 */
function CloudPanel({ provider, kind, model, onModelChange }: CloudPanelProps) {
  const [status, setStatus] = useState<SecretStatus | null>(null);
  const [canPersist, setCanPersist] = useState(true);
  const [keyInput, setKeyInput] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [health, setHealth] = useState<{ ok: boolean; message: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = async () => {
    try {
      const res = await window.speakright.getSecretStatuses();
      setCanPersist(res.canPersist);
      setStatus(res.secrets[provider] ?? null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };

  const loadModels = async () => {
    setModelsLoading(true);
    setError(null);
    try {
      const list = await window.speakright.listModels(kind);
      setModels(list);
      // If the persisted model was retired by the provider (e.g. Groq dropped
      // llama-3.3-70b-versatile), auto-select a current one so a 404 never
      // reaches transcription. Prefer the curated default, else the first hit.
      if (list.length && !list.includes(model)) {
        const preferred = (kind === 'llm' ? DEFAULT_LLM_MODEL : DEFAULT_STT_MODEL)[provider];
        onModelChange(list.includes(preferred) ? preferred : list[0]);
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => { void refreshStatus(); }, [provider]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadModels(); }, [provider, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveKey = async () => {
    setError(null);
    setMessage(null);
    try {
      const s = await window.speakright.setSecret(provider, keyInput);
      setStatus(s);
      setKeyInput('');
      setMessage('API key saved and encrypted.');
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };

  const clearKey = async () => {
    setError(null);
    setMessage(null);
    try {
      const s = await window.speakright.clearSecret(provider);
      setStatus(s);
      setMessage('API key removed.');
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };

  const testConnection = async () => {
    setError(null);
    setHealth(null);
    try {
      const h = await window.speakright.checkProviders();
      const entry = (kind === 'llm' ? h.llm : h.stt) as HealthCheck;
      setHealth(entry?.[provider] ?? { ok: false, message: 'No status returned' });
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };

  const configured = status?.configured ?? false;
  const sourceLabel = status?.source === 'keychain' ? 'stored in OS keychain' : status?.source === 'env' ? 'loaded from .env / environment' : 'not set';
  const options = models.includes(model) ? models : [model, ...models].filter(Boolean);

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-[var(--line)] bg-[var(--field)] p-4">
      <Field label={`${provider} API key`}>
        <div className="flex gap-2">
          <input
            type="password"
            autoComplete="off"
            className={inputCls}
            value={keyInput}
            placeholder={configured ? '•••••••• (replace — masked)' : `Enter ${provider} API key`}
            onChange={e => setKeyInput(e.target.value)}
          />
          <SolidButton disabled={!keyInput.trim() || !canPersist} onClick={saveKey}>
            Save
          </SolidButton>
          <GhostButton disabled={!configured} onClick={clearKey}>
            Clear
          </GhostButton>
        </div>
        <div className="text-[13px] text-[var(--ink-soft)] mt-1.5">
          {status?.masked ? `Key ${status.masked} — ${sourceLabel}.` : `API key ${sourceLabel}.`}
          {!canPersist && (
            <span className="block mt-1 text-[var(--warn)]">
              No OS keyring detected — the app cannot store keys here. Set
              SPEAKRIGHT_{provider.toUpperCase()}_API_KEY in a .env file instead
              (see apps/desktop/.env.example).
            </span>
          )}
        </div>
      </Field>

      <Field label="Model">
        <div className="flex gap-2 items-center">
          <select
            className={inputCls}
            value={model}
            onChange={e => onModelChange(e.target.value)}
            disabled={modelsLoading}
          >
            {options.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <GhostButton onClick={loadModels} className="shrink-0">
            {modelsLoading ? 'Fetching…' : 'Refresh'}
          </GhostButton>
        </div>
        <p className="text-[13px] text-[var(--muted)] mt-1.5">
          Model list is fetched from {provider}'s API using your key (falls back to a curated list offline).
        </p>
      </Field>

      <Field label="Connection">
        <GhostButton onClick={testConnection}>
          Test {kind === 'llm' ? 'LLM' : 'STT'} connection
        </GhostButton>
        {health && (
          <div className={`text-[13px] mt-1.5 ${health.ok ? 'text-[var(--accent-strong)]' : 'text-[var(--danger)]'}`}>
            {health.ok ? 'Connected — provider is reachable.' : health.message}
          </div>
        )}
      </Field>

      {message && <p className="text-[13px] text-[var(--accent-strong)]">{message}</p>}
      {error && <p className="text-[13px] text-[var(--danger)]">{error}</p>}
    </div>
  );
}

export function ProviderSettings({ settings, onUpdate }: Props) {
  const provider = settings.provider;

  const setProvider = (patch: Partial<typeof provider>) => {
    onUpdate({ provider: { ...provider, ...patch } });
  };

  const setSttProvider = (stt: any) => {
    // sttModel is per-provider; reset it so switching providers never reuses
    // a model name that belongs to a different STT backend.
    onUpdate({ provider: { ...provider, stt, sttModel: DEFAULT_STT_MODEL[stt] ?? '' } });
  };

  const setLlmProvider = (llm: any) => {
    onUpdate({ provider: { ...provider, llm, llmModel: DEFAULT_LLM_MODEL[llm] ?? '' } });
  };

  const sttIsCloud = CLOUD_PROVIDERS.includes(provider.stt as CloudProvider);
  const llmIsCloud = CLOUD_PROVIDERS.includes(provider.llm as CloudProvider);

  return (
    <>
      <Section title="Speech-to-text">
        <Field label="Provider">
          <select
            className={inputCls}
            value={provider.stt}
            onChange={e => setSttProvider(e.target.value as any)}
          >
            {STT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        {provider.stt === 'local-whisper' && (
          <Field label="Model">
            <select
              className={inputCls}
              value={provider.sttModel}
              onChange={e => setProvider({ sttModel: e.target.value })}
            >
              {WHISPER_MODEL_OPTIONS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>
        )}
        {provider.stt === 'sherpa-onnx' && (
          <Field label="Model directory">
            <input
              className={inputCls}
              value={provider.sttModel}
              onChange={e => setProvider({ sttModel: e.target.value })}
              placeholder="streaming-zipformer-en"
            />
          </Field>
        )}
        {sttIsCloud && (
          <CloudPanel
            provider={provider.stt as CloudProvider}
            kind="stt"
            model={provider.sttModel}
            onModelChange={v => setProvider({ sttModel: v })}
          />
        )}
        <ProviderNote
          text={
            provider.stt === 'local-whisper'
              ? 'Local Whisper runs entirely offline. Download models with ./scripts/download-whisper-model.sh base|small|medium'
              : provider.stt === 'sherpa-onnx'
                ? 'Sherpa-ONNX streaming Zipformer runs entirely offline. Download the model with ./scripts/download-sherpa-model.sh'
                : 'Cloud STT sends audio to an external service. Keys are encrypted at rest.'
          }
        />
      </Section>

      <Section title="Language model">
        <Field label="Provider">
          <select
            className={inputCls}
            value={provider.llm}
            onChange={e => setLlmProvider(e.target.value as any)}
          >
            {LLM_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        {provider.llm === 'ollama' && (
          <Field label="Model">
            <input
              className={inputCls}
              value={provider.llmModel}
              onChange={e => setProvider({ llmModel: e.target.value })}
              placeholder="llama3.1"
            />
          </Field>
        )}
        {llmIsCloud && (
          <CloudPanel
            provider={provider.llm as CloudProvider}
            kind="llm"
            model={provider.llmModel}
            onModelChange={v => setProvider({ llmModel: v })}
          />
        )}
        <ProviderNote
          text={
            provider.llm === 'ollama'
              ? 'Ollama runs locally. Make sure Ollama is running and the model has been pulled.'
              : 'Cloud LLM sends your transcript to an external service. Keys are encrypted at rest.'
          }
        />
      </Section>

      <CorrectionPromptSection
        promptValue={provider.llmPrompt}
        onApply={value => onUpdate({ provider: { ...provider, llmPrompt: value } })}
      />

      <Section title="Context & privacy">
        <Field label="Conversational context window">
          <select
            className={inputCls}
            value={provider.contextWindowSize}
            onChange={e => setProvider({ contextWindowSize: parseInt(e.target.value) })}
          >
            <option value={0}>No context</option>
            <option value={1}>1 utterance</option>
            <option value={3}>3 utterances (Recommended)</option>
            <option value={5}>5 utterances</option>
          </select>
        </Field>
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={provider.useLocalOnly}
            onChange={e => setProvider({ useLocalOnly: e.target.checked })}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm text-stone-700">Force local-only mode (no cloud calls)</span>
        </label>
      </Section>
    </>
  );
}

function ProviderNote({ text }: { text: string }) {
  return (
    <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">{text}</p>
  );
}