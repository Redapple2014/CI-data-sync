import { useState, useEffect, useCallback } from 'react';
import StatusBadge from './components/StatusBadge.jsx';
import Pipeline from './components/Pipeline.jsx';
import BuildStatus from './components/BuildStatus.jsx';
import JobPanel from './components/JobPanel.jsx';
import NodeCapacity from './components/NodeCapacity.jsx';

function timeAgo(ts) {
  if (!ts) return '—';
  const ms = typeof ts === 'number' ? ts : new Date(ts).getTime();
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  return `${Math.floor(hrs / 24)} day${Math.floor(hrs / 24) > 1 ? 's' : ''} ago`;
}

function TestCell({ test }) {
  if (!test || test.total === null) {
    return <span className="text-gray-400 text-sm">Skipped</span>;
  }
  if (test.failed > 0) {
    return (
      <span className="flex items-center gap-1 text-sm text-yellow-600">
        <span className="text-yellow-500">⚠</span> {test.failed} Failed
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-sm text-green-600">
      <span>✓</span> {test.passed} Passed
    </span>
  );
}

function BuildButton({ jobName }) {
  const [state, setState] = useState('idle'); // idle | loading | success | error

  async function trigger() {
    if (state === 'loading') return;
    setState('loading');
    try {
      const res = await fetch(`/api/build/${encodeURIComponent(jobName)}`, { method: 'POST' });
      if (!res.ok) throw new Error();
      setState('success');
      setTimeout(() => setState('idle'), 3000);
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  }

  const styles = {
    idle:    'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border-indigo-200',
    loading: 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed',
    success: 'bg-green-50 text-green-600 border-green-200',
    error:   'bg-red-50 text-red-600 border-red-200',
  };
  const labels = { idle: '▶ Build', loading: '...', success: '✓ Queued', error: '✗ Failed' };

  return (
    <button
      onClick={trigger}
      disabled={state === 'loading'}
      className={`text-xs px-2.5 py-1 rounded border font-medium transition-all ${styles[state]}`}
    >
      {labels[state]}
    </button>
  );
}

const TABS = ['Execution', 'Build Status', 'Node Capacity'];

export default function App() {
  const [tab, setTab] = useState('Execution');
  const [selectedJob, setSelectedJob] = useState(null);
  const [data, setData] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [countdown, setCountdown] = useState(30);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard');
      const json = await res.json();
      setData(json.data || []);
      setUpdatedAt(json.updatedAt);
      setError(null);
    } catch {
      setError('Failed to fetch dashboard data');
    } finally {
      setLoading(false);
      setCountdown(30);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const tick = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(tick);
  }, [updatedAt]);

  const filtered = data.filter((row) => {
    const q = search.toLowerCase();
    return (
      row.jobName?.toLowerCase().includes(q) ||
      row.repoName?.toLowerCase().includes(q) ||
      row.commitSha?.toLowerCase().includes(q)
    );
  });

  return (
    <>
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="max-w-screen-xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">DevOps</p>
            <h1 className="text-2xl font-bold text-gray-900">Project Execution</h1>
          </div>
          {tab === 'Execution' && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">
                {updatedAt ? `Updated ${timeAgo(updatedAt)} · refresh in ${countdown}s` : 'Loading...'}
              </span>
              <button
                onClick={fetchData}
                className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 text-gray-600"
              >
                ↻ Refresh
              </button>
              <input
                type="text"
                placeholder="Search job, repo, commit..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-gray-200">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab: Build Status */}
        {tab === 'Build Status' && <BuildStatus />}

        {/* Tab: Node Capacity */}
        {tab === 'Node Capacity' && <NodeCapacity />}

        {/* Tab: Execution */}
        {tab === 'Execution' && (
          <>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Work Item</th>
                    <th className="px-4 py-3 text-left">Repository</th>
                    <th className="px-4 py-3 text-left">PR Status</th>
                    <th className="px-4 py-3 text-left">Build Status</th>
                    <th className="px-4 py-3 text-left">Test Status</th>
                    <th className="px-4 py-3 text-left">Deployment Pipeline</th>
                    <th className="px-4 py-3 text-left">Last Deployment</th>
                    <th className="px-4 py-3 text-left">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                        Loading...
                      </td>
                    </tr>
                  )}
                  {!loading && filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                        No jobs found
                      </td>
                    </tr>
                  )}
                  {filtered.map((row) => (
                    <tr
                      key={row.jobName}
                      className={`hover:bg-gray-50 transition-colors cursor-pointer ${selectedJob?.jobName === row.jobName ? 'bg-indigo-50' : ''}`}
                      onClick={() => setSelectedJob(row)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-indigo-600 font-mono text-xs">
                          <span className="w-2 h-2 rounded-sm bg-indigo-200 inline-block" />
                          {row.commitSha || '—'}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[160px]">{row.jobName}</div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-gray-700">
                          <svg className="w-3.5 h-3.5 text-gray-400" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9z" />
                          </svg>
                          <span className="truncate max-w-[120px]">{row.repoName || '—'}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {row.pr ? (
                          <a href={row.pr.url} target="_blank" rel="noreferrer" className="hover:underline">
                            <StatusBadge status={row.pr.state} />
                          </a>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <StatusBadge status={row.buildResult} />
                      </td>

                      <td className="px-4 py-3">
                        <TestCell test={row.test} />
                      </td>

                      <td className="px-4 py-3">
                        <Pipeline stages={row.pipeline} />
                      </td>

                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {row.argocd?.lastSyncedAt
                          ? timeAgo(row.argocd.lastSyncedAt)
                          : row.buildTimestamp
                          ? timeAgo(row.buildTimestamp)
                          : '—'}
                      </td>

                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <BuildButton jobName={row.jobName} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs text-gray-400 text-right">
              {filtered.length} of {data.length} jobs · auto-refresh every 30s
            </p>
          </>
        )}
      </div>
    </div>
    <JobPanel job={selectedJob} onClose={() => setSelectedJob(null)} />
  </>
  );
}
