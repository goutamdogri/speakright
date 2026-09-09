import { Section, Field, inputCls, RangeMeta } from './GeneralSettings';
import type { AppSettings } from '@speakright/shared';

interface Props {
  settings: AppSettings;
  onUpdate: (patch: Partial<AppSettings>) => void;
}

export function OverlaySettings({ settings, onUpdate }: Props) {
  const overlay = settings.overlay;

  const setOverlay = (patch: Partial<typeof overlay>) => {
    onUpdate({ overlay: { ...overlay, ...patch } });
  };

  return (
    <Section title="Overlay Display">
      <Field label={`Width — ${overlay.width} px`}>
        <input
          type="number"
          className={inputCls}
          value={overlay.width}
          min={250}
          max={800}
          onChange={e => setOverlay({ width: parseInt(e.target.value) })}
        />
      </Field>

      <Field label="Opacity">
        <input
          type="range"
          min={0.3}
          max={1}
          step={0.05}
          value={overlay.opacity}
          onChange={e => setOverlay({ opacity: parseFloat(e.target.value) })}
        />
        <RangeMeta value={`${Math.round(overlay.opacity * 100)}%`} />
      </Field>

      <Field label="Font size">
        <input
          type="range"
          min={10}
          max={24}
          step={1}
          value={overlay.fontSize}
          onChange={e => setOverlay({ fontSize: parseInt(e.target.value) })}
        />
        <RangeMeta value={`${overlay.fontSize} px`} />
      </Field>

      <Field label="Display duration per correction">
        <input
          type="range"
          min={3000}
          max={30000}
          step={500}
          value={overlay.displayDurationMs}
          onChange={e => setOverlay({ displayDurationMs: parseInt(e.target.value) })}
        />
        <RangeMeta value={`${(overlay.displayDurationMs / 1000).toFixed(1)} s`} />
        <p className="text-[13px] text-[var(--muted)] mt-2">
          Minimum time each correction stays visible before the next one appears. Applies immediately — no restart needed.
        </p>
      </Field>

      <Field label="Queue size limit">
        <input
          type="number"
          className={inputCls}
          value={overlay.queueLimit}
          min={5}
          max={100}
          onChange={e => setOverlay({ queueLimit: parseInt(e.target.value) })}
        />
      </Field>

      <p className="text-[13px] text-[var(--muted)]">
        Drag the overlay to reposition it. Its position is saved automatically.
      </p>
    </Section>
  );
}