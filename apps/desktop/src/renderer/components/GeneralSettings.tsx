import type { AppSettings } from '@speakright/shared';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props {
  settings: AppSettings;
  onUpdate: (patch: Partial<AppSettings>) => void;
}

export function GeneralSettings({ settings, onUpdate }: Props) {
  return (
    <Section title="General">
      <Toggle
        label="Launch at system startup"
        description="Open SpeakRight in the tray when you sign in."
        checked={settings.general.launchAtStartup}
        onChange={v => onUpdate({ general: { ...settings.general, launchAtStartup: v } })}
      />
      <Field label="Language">
        <select
          className={inputCls}
          value={settings.general.language}
          onChange={e => onUpdate({ general: { ...settings.general, language: e.target.value } })}
        >
          <option value="en">English</option>
          <option value="hi">Hindi</option>
          <option value="es">Spanish</option>
        </select>
      </Field>

      <Divider />

      <Field label="Toggle Listening hotkey">
        <input
          className={inputCls}
          value={settings.hotkeys.toggleListening}
          onChange={e => onUpdate({ hotkeys: { ...settings.hotkeys, toggleListening: e.target.value } })}
          placeholder="Ctrl+Alt+E"
        />
      </Field>
      <Field label="Pause / Resume hotkey">
        <input
          className={inputCls}
          value={settings.hotkeys.pauseResume}
          onChange={e => onUpdate({ hotkeys: { ...settings.hotkeys, pauseResume: e.target.value } })}
          placeholder="Ctrl+Alt+P"
        />
      </Field>
      <Field label="Toggle Overlay hotkey">
        <input
          className={inputCls}
          value={settings.hotkeys.toggleOverlay}
          onChange={e => onUpdate({ hotkeys: { ...settings.hotkeys, toggleOverlay: e.target.value } })}
          placeholder="Ctrl+Alt+S"
        />
      </Field>
    </Section>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-[var(--line)] p-7 mb-5">
      <header className="flex items-baseline justify-between mb-6">
        <h2 className="text-[17px] font-semibold tracking-tight text-stone-900">{title}</h2>
        <span className="h-px flex-1 bg-[var(--line)] mx-5" aria-hidden="true" />
      </header>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-8 py-1">
      <div className="min-w-0">
        <div className="text-sm font-medium text-stone-800">{label}</div>
        {description && <p className="text-[13px] text-[var(--muted)] mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--line-strong)]'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(33,29,26,0.25)] transition-transform duration-200 ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-stone-600 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export const inputCls =
  'w-full rounded-lg border border-[var(--line-strong)] bg-[var(--field)] px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-[var(--muted)] transition-colors focus:outline-none focus:bg-white focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25';

/** Quiet, hairline-bordered secondary button. */
export function GhostButton({
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-white px-3.5 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 hover:text-stone-900 disabled:opacity-40 disabled:pointer-events-none ${className}`}
    >
      {children}
    </button>
  );
}

/** Solid primary button — ink, not a brand rainbow. The listening toggle is
    the one place allowed to use the green accent, for semantic clarity. */
export function SolidButton({
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg bg-stone-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:opacity-40 disabled:pointer-events-none ${className}`}
    >
      {children}
    </button>
  );
}

export function Divider() {
  return <hr className="border-[var(--line)]" />;
}

/** Compact label row under a range input: flanking captions + live value. */
export function RangeMeta({ left, right, value }: { left?: string; right?: string; value: string }) {
  return (
    <div className="flex items-center justify-between mt-1.5">
      {left ? <span className="text-xs text-[var(--muted)]">{left}</span> : <span />}
      <span className="text-xs font-medium tabular-nums text-[var(--accent-strong)]">{value}</span>
      {right ? <span className="text-xs text-[var(--muted)]">{right}</span> : <span />}
    </div>
  );
}

export default GeneralSettings;