import { useState, useEffect, useRef } from 'react';

function timeAgo(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function duration(ms) {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

const resultStyles = {
  SUCCESS:  'bg-green-100 text-green-700',
  FAILURE:  'bg-red-100 text-red-700',
  UNSTABLE: 'bg-yellow-100 text-yellow-700',
  BUILDING: 'bg-blue-100 text-blue-700 animate-pulse',
  ABORTED:  'bg-gray-100 text-gray-500',
  UNKNOWN:  'bg-gray-100 text-gray-400',
};

function HistoryTab({ jobName }) {
  const [builds, setBuilds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/jobs/${encodeURIComponent(jobName)}/history?limit=15`)
      .then((r) => r.json())
      .then((data) => { setBuilds(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [jobName]);

  if (loading) return <p className="text-sm text-gray-400 py-4 text-center">Loading history...</p>;
  if (!builds.length) return <p className="text-sm text-gray-400 py-4 text-center">No builds found.</p>;

  return (
    <div className="divide-y divide-gray-50">
      {builds.map((b) => (
        <div
          key={b.number}
          onClick={() => setSelected(selected === b.number ? null : b.number)}
          className="px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${resultStyles[b.result] || resultStyles.UNKNOWN}`}>
                {b.result}
              </span>
              <span className="text-sm font-mono text-gray-600">#{b.number}</span>
              {b.commitSha && (
                <span className="text-xs font-mono text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">
                  {b.commitSha}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span>{duration(b.duration)}</span>
              <span>{timeAgo(b.timestamp)}</span>
            </div>
          </div>

          {selected === b.number && (
            <LogViewer jobName={jobName} buildNumber={b.number} />
          )}
        </div>
      ))}
    </div>
  );
}

function LogViewer({ jobName, buildNumber }) {
  const [log, setLog] = useState('');
  const [loading, setLoading] = useState(true);
  const logRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    setLog('');
    fetch(`/api/jobs/${encodeURIComponent(jobName)}/log?build=${buildNumber}`)
      .then((r) => r.json())
      .then((data) => {
        setLog(data.text || '');
        setLoading(false);
        setTimeout(() => {
          if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
        }, 50);
      })
      .catch(() => setLoading(false));
  }, [jobName, buildNumber]);

  if (loading) return <p className="text-xs text-gray-400 mt-2">Loading log...</p>;

  return (
    <div
      ref={logRef}
      className="mt-3 bg-gray-900 text-green-400 text-xs font-mono rounded-lg p-3 max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed"
    >
      {log || 'No log output.'}
    </div>
  );
}

function InfoTab({ jobName }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/jobs/${encodeURIComponent(jobName)}`)
      .then((r) => r.json())
      .then((data) => { setInfo(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [jobName]);

  if (loading) return <p className="text-sm text-gray-400 py-4 text-center">Loading...</p>;
  if (!info) return <p className="text-sm text-gray-400 py-4 text-center">Failed to load.</p>;

  const health = info.healthReport?.[0];

  return (
    <div className="px-4 py-4 space-y-4">
      {health && (
        <div>
          <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide font-semibold">Health</p>
          <div className="flex items-center gap-3">
            <div className="h-2 w-40 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-2 rounded-full ${health.score >= 80 ? 'bg-green-400' : health.score >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                style={{ width: `${health.score}%` }}
              />
            </div>
            <span className="text-sm text-gray-600">{health.score}%</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">{health.description}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {[
          ['Last Build', info.lastBuild ? `#${info.lastBuild.number} · ${info.lastBuild.result}` : '—'],
          ['Last Success', info.lastSuccessfulBuild ? `#${info.lastSuccessfulBuild.number} · ${timeAgo(info.lastSuccessfulBuild.timestamp)}` : '—'],
          ['Last Failure', info.lastFailedBuild ? `#${info.lastFailedBuild.number} · ${timeAgo(info.lastFailedBuild.timestamp)}` : 'None'],
          ['Buildable', info.buildable ? 'Yes' : 'No'],
        ].map(([label, val]) => (
          <div key={label}>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">{label}</p>
            <p className="text-sm text-gray-700 mt-0.5">{val}</p>
          </div>
        ))}
      </div>

      {info.description && (
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Description</p>
          <p className="text-sm text-gray-600">{info.description}</p>
        </div>
      )}
    </div>
  );
}

const TABS = ['Info', 'History'];

export default function JobPanel({ job, onClose }) {
  const [tab, setTab] = useState('History');

  useEffect(() => {
    setTab('History');
  }, [job?.jobName]);

  if (!job) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-4 py-4 border-b border-gray-100 bg-gray-50">
          <div className="min-w-0">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Job Details</p>
            <h2 className="text-sm font-bold text-gray-900 mt-0.5 truncate">{job.jobName}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-500 font-mono">{job.commitSha}</span>
              <span className="text-gray-300">·</span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${resultStyles[job.buildResult] || resultStyles.UNKNOWN}`}>
                {job.buildResult}
              </span>
              <a
                href={job.jobUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-indigo-500 hover:underline"
              >
                Open in Jenkins ↗
              </a>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-3 mt-0.5 text-gray-400 hover:text-gray-600 text-lg leading-none flex-shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-4 bg-white">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'Info' && <InfoTab jobName={job.jobName} />}
          {tab === 'History' && <HistoryTab jobName={job.jobName} />}
        </div>
      </div>
    </>
  );
}
