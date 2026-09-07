import { Section, Toggle } from './GeneralSettings';
import type { AppSettings } from '@speakright/shared';

interface Props {
  settings: AppSettings;
  onUpdate: (patch: Partial<AppSettings>) => void;
}

export function CorrectionSettings({ settings, onUpdate }: Props) {
  const correction = settings.correction;

  const setCorrection = (patch: Partial<typeof correction>) => {
    onUpdate({ correction: { ...correction, ...patch } });
  };

  return (
    <Section title="Correction Behavior">
      <Toggle
        label="Correct grammar errors"
        checked={correction.grammar}
        onChange={v => setCorrection({ grammar: v })}
      />
      <Toggle
        label="Fix sentence structure"
        checked={correction.structure}
        onChange={v => setCorrection({ structure: v })}
      />
      <Toggle
        label="Suggest better sentence formation"
        checked={correction.formation}
        onChange={v => setCorrection({ formation: v })}
      />
      <Toggle
        label="Show confirmations for already-correct sentences"
        checked={correction.showConfirmations}
        onChange={v => setCorrection({ showConfirmations: v })}
      />

      <div className="pt-2">
        <label className="block text-sm text-slate-600 mb-1">
          Confidence threshold ({Math.round(correction.confidenceThreshold * 100)}%)
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={correction.confidenceThreshold}
          onChange={e => setCorrection({ confidenceThreshold: parseFloat(e.target.value) })}
          className="w-full"
        />
        <p className="text-xs text-slate-400 mt-1">
          Corrections below this confidence are hidden from the overlay.
        </p>
      </div>
    </Section>
  );
}
