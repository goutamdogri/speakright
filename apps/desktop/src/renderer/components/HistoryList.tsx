import { useEffect, useState } from 'react';
import { Section, inputCls } from './GeneralSettings';

interface HistoryEntry {
  session: any;
  utterance: any;
  correction: any;
  issues: any[];
}

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
    <Section title="Correction History">
      <div className="flex gap-2 mb-4">
        <input
          className={inputCls}
          placeholder="Search by text..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <select
          className={inputCls + ' w-40'}
          value={issueType}
          onChange={e => setIssueType(e.target.value)}
        >
          <option value="">All types</option>
          <option value="grammar">Grammar</option>
          <option value="structure">Structure</option>
          <option value="formation">Formation</option>
        </select>
        <button
          className="px-4 py-2 bg-red-50 text-red-600 rounded-md text-sm hover:bg-red-100"
          onClick={async () => {
            if (confirm('Clear all history?')) {
              await window.speakright.clearHistory();
              setEntries([]);
            }
          }}
        >
          Clear
        </button>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-400 text-sm">No corrections found yet.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry, idx) => (
            <div
              key={entry.correction.id || idx}
              className="border border-slate-200 rounded-lg p-3"
            >
              <div className="text-sm text-slate-500 line-through decoration-red-400">
                {entry.correction.originalText}
              </div>
              <div className="text-sm text-green-600 mt-1 font-medium">
                {entry.correction.correctedText}
              </div>
              {entry.issues.length > 0 && (
                <div className="mt-2 space-y-1">
                  {entry.issues.map((issue, i) => (
                    <div key={i} className="text-xs text-slate-500">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 mr-2">
                        {issue.type}
                      </span>
                      {issue.explanation}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                <span>
                  {new Date(entry.correction.createdAt).toLocaleString()}
                </span>
                <button
                  className="text-red-500 hover:text-red-600"
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
