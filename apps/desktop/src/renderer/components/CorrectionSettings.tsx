import { Section, Toggle, RangeMeta } from './GeneralSettings';
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
    <Section title="What to correct">
      <Toggle
        label="Grammar errors"
        description="Tense, agreement, articles, prepositions."
        checked={correction.grammar}
        onChange={v => setCorrection({ grammar: v })}
      />
      <Toggle
        label="Sentence structure"
        description="Word order and awkward constructions."
        checked={correction.structure}
        onChange={v => setCorrection({ structure: v })}
      />
      <Toggle
        label="Better alternatives"
        description="Suggest more natural ways to say the same thing."
        checked={correction.formation}
        onChange={v => setCorrection({ formation: v })}
      />
      <Toggle
        label="Confirmations"
        description="Acknowledge sentences that were already correct."
        checked={correction.showConfirmations}
        onChange={v => setCorrection({ showConfirmations: v })}
      />

      <div className="pt-2">
        <div className="text-[13px] font-medium text-[var(--ink-soft)] mb-1.5">Confidence threshold</div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={correction.confidenceThreshold}
          onChange={e => setCorrection({ confidenceThreshold: parseFloat(e.target.value) })}
        />
        <RangeMeta
          left="Forgiving"
          right="Strict"
          value={`${Math.round(correction.confidenceThreshold * 100)}%`}
        />
        <p className="text-[13px] text-[var(--muted)] mt-2">
          Corrections the model is less sure about than this are hidden from the overlay.
        </p>
      </div>
    </Section>
  );
}