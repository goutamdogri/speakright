import { Section, Field, inputCls } from './GeneralSettings';
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
      <Field label="Width (px)">
        <input
          type="number"
          className={inputCls}
          value={overlay.width}
          min={250}
          max={800}
          onChange={e => setOverlay({ width: parseInt(e.target.value) })}
        />
      </Field>

      <Field label={`Opacity (${Math.round(overlay.opacity * 100)}%)`}>
        <input
          type="range"
          min={0.3}
          max={1}
          step={0.05}
          value={overlay.opacity}
          onChange={e => setOverlay({ opacity: parseFloat(e.target.value) })}
          className="w-full"
        />
      </Field>

      <Field label={`Font size (${overlay.fontSize}px)`}>
        <input
          type="range"
          min={10}
          max={24}
          step={1}
          value={overlay.fontSize}
          onChange={e => setOverlay({ fontSize: parseInt(e.target.value) })}
          className="w-full"
        />
      </Field>

      <Field label={`Display duration (${overlay.displayDurationMs / 1000}s)`}>
        <input
          type="range"
          min={3000}
          max={30000}
          step={500}
          value={overlay.displayDurationMs}
          onChange={e => setOverlay({ displayDurationMs: parseInt(e.target.value) })}
          className="w-full"
        />
        <p className="text-xs text-slate-400 mt-1">
          Minimum time each correction stays visible before the next one appears.
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

      <p className="text-xs text-slate-400 mt-2">
        Drag the overlay to reposition it. Its position is saved automatically.
      </p>
    </Section>
  );
}
