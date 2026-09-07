import { Section, Field, inputCls } from './GeneralSettings';
import type { AppSettings } from '@speakright/shared';

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

const WHISPER_MODEL_OPTIONS = ['base', 'small', 'medium', 'large'] as const;

const LLM_OPTIONS = [
  { value: 'ollama', label: 'Ollama (Local Model)' },
  { value: 'groq', label: 'Groq LLM (Cloud)' },
  { value: 'openai', label: 'OpenAI (Cloud)' },
  { value: 'gemini', label: 'Google Gemini (Cloud)' },
] as const;

export function ProviderSettings({ settings, onUpdate }: Props) {
  const provider = settings.provider;

  const setProvider = (patch: Partial<typeof provider>) => {
    onUpdate({ provider: { ...provider, ...patch } });
  };

  return (
    <>
      <Section title="Speech-to-Text (STT) Provider">
        <Field label="Provider">
          <select
            className={inputCls}
            value={provider.stt}
            onChange={e => setProvider({ stt: e.target.value as any })}
          >
            {STT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Model">
          {provider.stt === 'local-whisper' ? (
            <select
              className={inputCls}
              value={provider.sttModel}
              onChange={e => setProvider({ sttModel: e.target.value })}
            >
              {WHISPER_MODEL_OPTIONS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input
              className={inputCls}
              value={provider.sttModel}
              onChange={e => setProvider({ sttModel: e.target.value })}
              placeholder={provider.stt === 'sherpa-onnx' ? 'streaming-zipformer-en' : 'whisper-large-v3-turbo'}
            />
          )}
        </Field>
        <p className="text-xs text-amber-600">
          {provider.stt === 'local-whisper'
            ? 'Local Whisper runs entirely offline. Download models with ./scripts/download-whisper-model.sh base|small|medium'
            : provider.stt === 'sherpa-onnx'
              ? 'Sherpa-ONNX streaming Zipformer runs entirely offline. Download the model with ./scripts/download-sherpa-model.sh'
              : 'Cloud STT will send your audio to an external service for transcription.'}
        </p>
      </Section>

      <Section title="Language Model (LLM) Provider">
        <Field label="Provider">
          <select
            className={inputCls}
            value={provider.llm}
            onChange={e => setProvider({ llm: e.target.value as any })}
          >
            {LLM_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Model">
          <input
            className={inputCls}
            value={provider.llmModel}
            onChange={e => setProvider({ llmModel: e.target.value })}
            placeholder="llama3.1"
          />
        </Field>
        <p className="text-xs text-amber-600">
          {provider.llm === 'ollama'
            ? 'Ollama runs locally. Ensure Ollama is running and the model is pulled.'
            : 'Cloud LLM will send your transcript to an external service.'}
        </p>
      </Section>

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
