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
        label="Dark theme"
        description="Dimmer surfaces with lighter type. Useful at night or in low light."
        checked={settings.general.theme === 'dark'}
        onChange={v => onUpdate({ general: { ...settings.general, theme: v ? 'dark' : 'light' } })}
      />
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
    <section className="bg-[var(--surface)] rounded-2xl border border-[var(--line)] p-7 mb-5">
      <header className="flex items-baseline justify-between mb-6">
        <h2 className="text-[17px] font-semibold tracking-tight text-[var(--ink)]">{title}</h2>
        <span className="h-px flex-1 bg-[var(--line)] mx-5" aria-hidden="true" />
      </header>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

/**
 * Linear-style switch.
 *
 * The knob slides between two fixed inset positions (`left-[2px]` and
 * `left-[22px]`) so it never visually escapes the pill, even though the pill
 * itself is 44px wide and the knob is 20px — the remaining 2px on each side
 * keeps the circle comfortably inside the rounded track.
 */
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
        <div className="text-sm font-medium text-[var(--ink)]">{label}</div>
        {description && <p className="text-[13px] text-[var(--muted)] mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-[2px] transition-colors duration-200 ${
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--line-strong)]'
        }`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-[var(--solid-text)] shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-all duration-200 ${
            checked ? 'translate-x-[20px]' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-[var(--ink-soft)] mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export const inputCls =
  'w-full rounded-lg border border-[var(--line-strong)] bg-[var(--field)] px-3.5 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] transition-colors focus:outline-none focus:bg-[var(--surface)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25';

/** Quiet, hairline-bordered secondary button. */
export function GhostButton({
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 py-2 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)] disabled:opacity-40 disabled:pointer-events-none ${className}`}
    >
      {children}
    </button>
  );
}

/** Solid primary button — always high-contrast, never a brand rainbow. */
export function SolidButton({
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--solid-bg)] px-3.5 py-2 text-sm font-medium text-[var(--solid-text)] transition-colors hover:bg-[var(--solid-bg-hover)] disabled:opacity-40 disabled:pointer-events-none ${className}`}
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