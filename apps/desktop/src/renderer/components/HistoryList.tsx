import { useEffect, useState } from 'react';
import { Section, inputCls, GhostButton } from './GeneralSettings';

interface HistoryEntry {
  session: any;
  utterance: any;
  correction: any;
  issues: any[];
}

const ISSUE_TYPES = ['grammar', 'structure', 'formation'];

export function HistoryView() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [issueType, setIssueType] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadHistory = async () => {
    const result = await window.speakright.getHistory({ limit: 100, offset: 0 });
    setEntries(result);
    setLoading(false);
  };

  const filtered = entries.filter(e => {
    const matchesText =
      !query ||
      (e.correction.originalText || '').toLowerCase().includes(query.toLowerCase()) ||
      (e.correction.correctedText || '').toLowerCase().includes(query.toLowerCase());
    const matchesType =
      !issueType || e.issues.some(i => i.type === issueType);
    return matchesText && matchesType;
  });

  return (
    <Section title="Correction history">
      <div className="flex flex-wrap gap-2 mb-5">
        <input
          className={`${inputCls} max-w-xs`}
          placeholder="Search by text…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <select
          className={`${inputCls} w-40`}
          value={issueType}
          onChange={e => setIssueType(e.target.value)}
        >
          <option value="">All types</option>
          {ISSUE_TYPES.map(t => (
            <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
        <GhostButton
          className="border-red-200 text-[var(--danger)] hover:bg-red-50 hover:text-[var(--danger)]"
          onClick={async () => {
            if (confirm('Clear all history?')) {
              await window.speakright.clearHistory();
              setEntries([]);
            }
          }}
        >
          Clear all
        </GhostButton>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line-strong)] py-10 text-center text-sm text-[var(--muted)]">
          {entries.length === 0
            ? 'No corrections yet. They’ll appear here as you speak.'
            : 'Nothing matches your filters.'}
        </div>
      ) : (
        <div className="divide-y divide-[var(--line)]">
          {filtered.map((entry, idx) => (
            <div key={entry.correction.id || idx} className="py-4 first:pt-0 last:pb-0">
              <div className="text-[15px] text-[var(--muted)] line-through decoration-red-300 decoration-1 leading-snug break-words">
                {entry.correction.originalText}
              </div>
              <div className="text-[15px] font-medium text-[var(--ink)] mt-1 leading-snug break-words">
                {entry.correction.correctedText}
              </div>
              {entry.issues.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  {entry.issues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-2 text-[13px] text-[var(--muted)]">
                      <span className="inline-flex shrink-0 items-center rounded-md border border-[var(--line)] bg-[var(--field)] px-1.5 py-0.5 text-[11px] font-medium text-stone-600">
                        {issue.type}
                      </span>
                      <span className="leading-snug">{issue.explanation}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-[var(--muted)] tabular-nums">
                  {new Date(entry.correction.createdAt).toLocaleString()}
                </span>
                <button
                  className="text-[13px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--danger)]"
                  onClick={async () => {
                    await window.speakright.deleteHistoryItem(entry.correction.id);
                    loadHistory();
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}