import type { AppSettings } from '@speakright/shared';

interface Props {
  settings: AppSettings;
  onUpdate: (patch: Partial<AppSettings>) => void;
}

export function GeneralSettings({ settings, onUpdate }: Props) {
  return (
    <Section title="General">
      <Toggle
        label="Launch at system startup"
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

      <Field label="Toggle Listening Hotkey">
        <input
          className={inputCls}
          value={settings.hotkeys.toggleListening}
          onChange={e => onUpdate({ hotkeys: { ...settings.hotkeys, toggleListening: e.target.value } })}
          placeholder="Ctrl+Alt+E"
        />
      </Field>
      <Field label="Pause/Resume Hotkey">
        <input
          className={inputCls}
          value={settings.hotkeys.pauseResume}
          onChange={e => onUpdate({ hotkeys: { ...settings.hotkeys, pauseResume: e.target.value } })}
          placeholder="Ctrl+Alt+P"
        />
      </Field>
      <Field label="Toggle Overlay Hotkey">
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

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 mb-4">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between py-1 cursor-pointer">
      <span className="text-sm text-slate-700">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`w-10 h-6 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}
        aria-pressed={checked}
      >
        <span
          className={`block w-4 h-4 bg-white rounded-full transform transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

export const inputCls =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';

export function Divider() {
  return <hr className="border-slate-200" />;
}

export default GeneralSettings;
