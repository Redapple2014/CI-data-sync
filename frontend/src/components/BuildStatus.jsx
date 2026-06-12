import { useState, useEffect } from 'react';

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function duration(ms) {
  if (!ms || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `~${m}m` : `~${s}s`;
}

function QueueCard({ items }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <span className="font-semibold text-gray-700 text-sm">Build Queue</span>
        <span className="text-xs text-gray-400">{items.length} item{items.length !== 1 ? 's' : ''}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-400">No builds in the queue.</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <a
                  href={item.jobUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-indigo-600 hover:underline"
                >
                  {item.jobName}
                </a>
                <p className="text-xs text-gray-400 mt-0.5">{item.why}</p>
              </div>
              <div className="flex items-center gap-2">
                {item.stuck && (
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Stuck</span>
                )}
                <span className="text-xs text-gray-400">{timeAgo(item.inQueueSince)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExecutorCard({ executors }) {
  const busy = executors.filter((e) => !e.idle).length;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <span className="font-semibold text-gray-700 text-sm">Build Executor Status</span>
        <span className="text-xs text-gray-400">{busy}/{executors.length}</span>
      </div>
      {executors.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-400">No executors found.</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {executors.map((ex, i) => (
            <li key={`${ex.node}-${i}`} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${ex.idle ? 'bg-gray-300' : 'bg-green-500 animate-pulse'}`} />
                  <span className="text-xs text-gray-500">{ex.node} #{ex.index}</span>
                </div>
                {!ex.idle && ex.progress != null && (
                  <span className="text-xs text-gray-400">{ex.progress}%</span>
                )}
              </div>
              {ex.idle ? (
                <p className="text-xs text-gray-400 ml-5 mt-0.5">Idle</p>
              ) : (
                <div className="ml-5 mt-1">
                  <a
                    href={ex.job?.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-600 hover:underline truncate block max-w-xs"
                  >
                    {ex.job?.name}
                  </a>
                  {ex.progress != null && (
                    <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden w-48">
                      <div
                        className="h-1 bg-green-400 rounded-full transition-all"
                        style={{ width: `${ex.progress}%` }}
                      />
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">
                    Started {timeAgo(ex.job?.startedAt)}
                    {ex.job?.estimatedDuration > 0 && ` · ${duration(ex.job.estimatedDuration)} total`}
                    {ex.likelyStuck && ' · ⚠ likely stuck'}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function BuildStatus() {
  const [data, setData] = useState({ queue: [], executors: [] });
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch('/api/queue');
        const json = await res.json();
        setData(json);
        setLastUpdate(new Date());
        setError(null);
      } catch {
        setError('Failed to fetch build status');
      }
    }
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Live · refreshes every 5s
          {lastUpdate && ` · last at ${lastUpdate.toLocaleTimeString()}`}
        </p>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
      <QueueCard items={data.queue} />
      <ExecutorCard executors={data.executors} />
    </div>
  );
}
