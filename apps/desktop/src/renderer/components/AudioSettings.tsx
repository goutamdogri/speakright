import { useEffect, useState } from 'react';
import { Section, Field, inputCls, GhostButton, RangeMeta } from './GeneralSettings';
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

  const hint = current
    ? `Using: ${current.label || 'Microphone'}`
    : devices.length === 0
      ? 'No microphones detected yet — grant mic permission and click Refresh.'
      : 'Using the system default microphone. Pick a device above if the built-in mic doesn\'t work.';

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
          <GhostButton onClick={() => void loadDevices()} disabled={refreshing} className="shrink-0">
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </GhostButton>
        </div>
        <p className="text-[13px] text-[var(--muted)] mt-1.5">{hint}</p>
      </Field>

      <Field label="VAD sensitivity">
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={audio.vadSensitivity}
          onChange={e => onUpdate({ audio: { ...audio, vadSensitivity: parseFloat(e.target.value) } })}
        />
        <RangeMeta left="Strict" right="Sensitive" value={audio.vadSensitivity.toFixed(1)} />
      </Field>

      <Field label="Silence before an utterance ends">
        <input
          type="range"
          min={300}
          max={2000}
          step={50}
          value={audio.silenceDurationMs}
          onChange={e => onUpdate({ audio: { ...audio, silenceDurationMs: parseInt(e.target.value) } })}
        />
        <RangeMeta value={`${audio.silenceDurationMs} ms`} />
      </Field>

      <Field label="Maximum utterance length">
        <input
          type="range"
          min={5000}
          max={20000}
          step={500}
          value={audio.maxUtteranceMs}
          onChange={e => onUpdate({ audio: { ...audio, maxUtteranceMs: parseInt(e.target.value) } })}
        />
        <RangeMeta value={`${(audio.maxUtteranceMs / 1000).toFixed(1)} s`} />
      </Field>
    </Section>
  );
}