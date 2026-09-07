import { useEffect, useState } from 'react';
import { Section, Field, inputCls } from './GeneralSettings';
import type { AppSettings } from '@speakright/shared';

interface Props {
  settings: AppSettings;
  onUpdate: (patch: Partial<AppSettings>) => void;
}

interface AudioDevice {
  deviceId: string;
  label: string;
}

export function AudioSettings({ settings, onUpdate }: Props) {
  const audio = settings.audio;
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadDevices = async () => {
    setRefreshing(true);
    try {
      const list = (await window.speakright.getAudioDevices()) as AudioDevice[];
      setDevices(list);
    } catch {
      setDevices([]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadDevices();
  }, []);

  const current = audio.deviceId
    ? devices.find(d => d.deviceId === audio.deviceId)
    : undefined;

  const selectDevice = (deviceId: string) => {
    if (deviceId === '' || deviceId === 'default') {
      onUpdate({ audio: { ...audio, deviceId: null } });
    } else {
      onUpdate({ audio: { ...audio, deviceId } });
    }
  };

  return (
    <Section title="Audio Input">
      <Field label="Microphone">
        <div className="flex items-center gap-2">
          <select
            className={inputCls}
            value={audio.deviceId ?? 'default'}
            onChange={e => selectDevice(e.target.value)}
          >
            <option value="default">System default</option>
            {devices.map(d => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Microphone'}
              </option>
            ))}
            {current && !devices.some(d => d.deviceId === current.deviceId) && (
              <option value={current.deviceId}>{current.label}</option>
            )}
          </select>
          <button
            onClick={() => void loadDevices()}
            className="px-3 py-2 rounded-md text-sm font-medium border border-slate-300 text-slate-600 hover:bg-slate-50 shrink-0"
            disabled={refreshing}
          >
            {refreshing ? '…' : 'Refresh'}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          {current
            ? `Using: ${current.label || 'Microphone'}`
            : devices.length === 0
              ? 'No microphones detected yet — grant mic permission and click Refresh.'
              : 'Using the system default microphone. Pick a device above if the built-in mic doesn\'t work.'}
        </p>
      </Field>

      <Field label="VAD Sensitivity">
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={audio.vadSensitivity}
          onChange={e => onUpdate({ audio: { ...audio, vadSensitivity: parseFloat(e.target.value) } })}
          className="w-full"
        />
        <p className="text-xs text-slate-400">{audio.vadSensitivity} — higher is more sensitive</p>
      </Field>

      <Field label={`Silence duration before utterance ends (${audio.silenceDurationMs} ms)`}>
        <input
          type="range"
          min={300}
          max={2000}
          step={50}
          value={audio.silenceDurationMs}
          onChange={e => onUpdate({ audio: { ...audio, silenceDurationMs: parseInt(e.target.value) } })}
          className="w-full"
        />
      </Field>

      <Field label={`Maximum utterance length (${audio.maxUtteranceMs / 1000} s)`}>
        <input
          type="range"
          min={5000}
          max={20000}
          step={500}
          value={audio.maxUtteranceMs}
          onChange={e => onUpdate({ audio: { ...audio, maxUtteranceMs: parseInt(e.target.value) } })}
          className="w-full"
        />
      </Field>
    </Section>
  );
}