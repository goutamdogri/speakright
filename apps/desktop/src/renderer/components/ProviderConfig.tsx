import { useEffect, useState } from 'react';
import { Section, Field, inputCls } from './GeneralSettings';
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
    <Section title="LLM Correction Prompt">
      <p className="text-xs text-slate-500 -mt-2 mb-2">
        System prompt sent to the active LLM provider on every correction. Edits apply immediately to the next
        correction — no restart required. Restore to go back to the built-in English-coach prompt.
      </p>
      <Field label="System prompt">
        <textarea
          className={`${inputCls} resize-y min-h-[220px] font-mono text-xs leading-relaxed`}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          spellCheck={false}
        />
      </Field>
      <div className="flex items-center gap-2 mt-1">
        <button
          type="button"
          disabled={draft === promptValue}
          onClick={() => apply(draft)}
          className="px-3 py-2 rounded-md text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40"
        >
          Apply &amp; save
        </button>
        <button
          type="button"
          disabled={!isCustom && draft === DEFAULT_CORRECTION_PROMPT}
          onClick={() => apply(DEFAULT_CORRECTION_PROMPT)}
          className="px-3 py-2 rounded-md text-sm text-slate-700 border border-slate-300 hover:bg-slate-100 disabled:opacity-40"
        >
          Restore default
        </button>
        {saved && <span className="text-xs text-green-600">Saved — active immediately.</span>}
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
    <div className="space-y-3 border border-slate-200 rounded-lg p-4 bg-slate-50">
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
          <button
            type="button"
            disabled={!keyInput.trim() || !canPersist}
            onClick={saveKey}
            className="px-3 py-2 rounded-md text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            disabled={!configured}
            onClick={clearKey}
            className="px-3 py-2 rounded-md text-sm text-slate-700 border border-slate-300 hover:bg-slate-100 disabled:opacity-40"
          >
            Clear
          </button>
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {status?.masked ? `Key ${status.masked} — ${sourceLabel}.` : `API key ${sourceLabel}.`}
          {!canPersist && (
            <span className="text-amber-600 block mt-1">
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
          <button
            type="button"
            onClick={loadModels}
            className="px-3 py-2 rounded-md text-sm text-slate-700 border border-slate-300 hover:bg-slate-100 disabled:opacity-40"
          >
            {modelsLoading ? 'Fetching…' : 'Refresh'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Model list is fetched from {provider}'s API using your key (falls back to a curated list offline).
        </p>
      </Field>

      <Field label="Test connection">
        <button
          type="button"
          onClick={testConnection}
          className="px-3 py-2 rounded-md text-sm text-slate-700 border border-slate-300 hover:bg-slate-100"
        >
          Test {kind === 'llm' ? 'LLM' : 'STT'} connection
        </button>
        {health && (
          <div className={`text-xs mt-1 ${health.ok ? 'text-green-600' : 'text-red-600'}`}>
            {health.ok ? 'Connected — provider is reachable.' : health.message}
          </div>
        )}
      </Field>

      {message && <p className="text-xs text-green-600">{message}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
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
      <Section title="Speech-to-Text (STT) Provider">
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
        <p className="text-xs text-amber-600">
          {provider.stt === 'local-whisper'
            ? 'Local Whisper runs entirely offline. Download models with ./scripts/download-whisper-model.sh base|small|medium'
            : provider.stt === 'sherpa-onnx'
              ? 'Sherpa-ONNX streaming Zipformer runs entirely offline. Download the model with ./scripts/download-sherpa-model.sh'
              : 'Cloud STT sends audio to an external service. Configure the API key below; keys are encrypted at rest.'}
        </p>
      </Section>

      <Section title="Language Model (LLM) Provider">
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
        <p className="text-xs text-amber-600">
          {provider.llm === 'ollama'
            ? 'Ollama runs locally. Ensure Ollama is running and the model is pulled.'
            : 'Cloud LLM sends your transcript to an external service. Configure the API key below; keys are encrypted at rest.'}
        </p>
      </Section>

      <CorrectionPromptSection
        promptValue={provider.llmPrompt}
        onApply={value => onUpdate({ provider: { ...provider, llmPrompt: value } })}
      />

      <Section title="Context & Privacy">
        <Field label="Conversational context window (utterances)">
          <select
            className={inputCls}
            value={provider.contextWindowSize}
            onChange={e => setProvider({ contextWindowSize: parseInt(e.target.value) })}
          >
            <option value={0}>No context</option>
            <option value={1}>1</option>
            <option value={3}>3 (Recommended)</option>
            <option value={5}>5</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 py-1 cursor-pointer">
          <input
            type="checkbox"
            checked={provider.useLocalOnly}
            onChange={e => setProvider({ useLocalOnly: e.target.checked })}
            className="rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">Force local-only mode (no cloud calls)</span>
        </label>
      </Section>
    </>
  );
}