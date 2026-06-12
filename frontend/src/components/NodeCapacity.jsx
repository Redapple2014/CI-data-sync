import { useState, useEffect } from 'react';

function pct(val, total) {
  if (!total) return 0;
  return Math.min(100, (val / total) * 100);
}

function fmtCpu(m)  { return m >= 1000 ? `${(m/1000).toFixed(2)}c` : `${Math.round(m)}m`; }
function fmtMem(mb) { return mb >= 1024 ? `${(mb/1024).toFixed(1)}G` : `${Math.round(mb)}M`; }

// Three-segment bar: [requests green][ci-reserve orange][free gray]
// Limits shown as a separate thin bar below.
function ResourceRow({ label, allocatable, requests, ciReserve, limits, unitFn }) {
  const reqPct = pct(requests, allocatable);
  const ciPct  = Math.min(100 - reqPct, pct(ciReserve, allocatable));
  const freePct = Math.max(0, 100 - reqPct - ciPct);
  const limPct  = Math.min(100, pct(limits, allocatable));
  const hasLim  = limits > 0;
  const overcommitted = limits > allocatable;
  const schedulable = Math.max(0, allocatable - requests - ciReserve);

  const reqColor = reqPct >= 90 ? 'bg-red-500' : reqPct >= 70 ? 'bg-yellow-400' : 'bg-green-500';

  return (
    <div className="mb-4">
      {/* Row header */}
      <div className="flex justify-between items-baseline text-xs mb-1">
        <span className="font-semibold text-gray-600">{label}</span>
        <span className="text-gray-400">allocatable {unitFn(allocatable)}</span>
      </div>

      {/* Committed / CI / Free stacked bar */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-gray-400 w-16 shrink-0">Committed</span>
        <div className="flex-1 flex rounded-full overflow-hidden h-3 bg-gray-100">
          <div className={`h-3 ${reqColor} transition-all`}       style={{ width: `${reqPct}%` }} title={`Requests: ${unitFn(requests)}`} />
          <div className="h-3 bg-orange-300 transition-all"        style={{ width: `${ciPct}%`  }} title={`CI reserved: ${unitFn(ciReserve)}`} />
          <div className="h-3 bg-gray-100 transition-all flex-1"  title={`Schedulable free: ${unitFn(schedulable)}`} />
        </div>
        <div className="text-xs w-36 text-right shrink-0 space-x-1">
          <span className={`font-semibold ${reqPct >= 90 ? 'text-red-600' : reqPct >= 70 ? 'text-yellow-600' : 'text-green-700'}`}>
            {unitFn(requests)}
          </span>
          <span className="text-gray-300">+</span>
          <span className="text-orange-500 font-semibold">{unitFn(ciReserve)} CI</span>
          <span className="text-gray-300">=</span>
          <span className="text-gray-400">{unitFn(schedulable)} free</span>
        </div>
      </div>

      {/* Limits bar */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 w-16 shrink-0">Limits</span>
        <div className="flex-1 bg-gray-100 rounded-full h-2 relative overflow-hidden">
          {hasLim ? (
            <div
              className={`h-2 rounded-full transition-all ${overcommitted ? 'bg-red-300' : 'bg-blue-300'}`}
              style={{ width: `${limPct}%` }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center pl-2">
              <span className="text-gray-300" style={{ fontSize: '9px' }}>no limits set</span>
            </div>
          )}
        </div>
        <div className="text-xs w-36 text-right shrink-0">
          {hasLim ? (
            <span className={`font-semibold ${overcommitted ? 'text-red-500' : 'text-blue-500'}`}>
              {unitFn(limits)}
              {overcommitted && <span className="ml-1 text-red-400 font-normal">(overcommitted)</span>}
            </span>
          ) : (
            <span className="text-gray-300">—</span>
          )}
        </div>
      </div>
    </div>
  );
}

function PodRow({ pods, allocatable }) {
  const p = pct(pods, allocatable);
  const color = p >= 90 ? 'bg-red-500' : p >= 70 ? 'bg-yellow-400' : 'bg-green-500';
  return (
    <div className="mb-4">
      <div className="flex justify-between text-xs mb-1">
        <span className="font-semibold text-gray-600">Pods</span>
        <span className="text-gray-400">max {allocatable}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 w-16 shrink-0">Running</span>
        <div className="flex-1 bg-gray-100 rounded-full h-3">
          <div className={`h-3 rounded-full transition-all ${color}`} style={{ width: `${p}%` }} />
        </div>
        <span className={`text-xs font-semibold w-36 text-right ${p >= 90 ? 'text-red-600' : p >= 70 ? 'text-yellow-600' : 'text-green-700'}`}>
          {pods} <span className="text-gray-400 font-normal">/ {allocatable} ({p.toFixed(0)}%)</span>
        </span>
      </div>
    </div>
  );
}

function NodeCard({ node }) {
  const { name, roles, allocatable, requests, limits, ciReserve, namespaces } = node;

  const reqCpuPct = pct(requests.cpuMillicores, allocatable.cpuMillicores);
  const reqMemPct = pct(requests.memoryMiB, allocatable.memoryMiB);
  const podPct    = pct(requests.pods, allocatable.pods);
  const worst = Math.max(reqCpuPct, reqMemPct, podPct);
  const borderColor = worst >= 90 ? 'border-red-400' : worst >= 70 ? 'border-yellow-400' : 'border-green-400';

  const schedCpu = Math.max(0, allocatable.cpuMillicores - requests.cpuMillicores - ciReserve.cpuMillicores);
  const schedMem = Math.max(0, allocatable.memoryMiB     - requests.memoryMiB     - ciReserve.memoryMiB);

  return (
    <div className={`bg-white rounded-xl shadow border-l-4 ${borderColor} p-5`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-800 text-base">{name}</h3>
          <div className="flex gap-1 mt-0.5">
            {roles.map((r) => (
              <span key={r} className="text-xs bg-indigo-50 text-indigo-600 rounded px-1.5 py-0.5">{r}</span>
            ))}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-200">{requests.pods}</div>
          <div className="text-xs text-gray-400">pods running</div>
        </div>
      </div>

      {/* Schedulable summary chips */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <span className="text-xs bg-green-50 text-green-700 rounded px-2 py-1">
          Free CPU: <strong>{fmtCpu(schedCpu)}</strong>
        </span>
        <span className="text-xs bg-green-50 text-green-700 rounded px-2 py-1">
          Free Mem: <strong>{fmtMem(schedMem)}</strong>
        </span>
        <span className="text-xs bg-orange-50 text-orange-600 rounded px-2 py-1">
          CI reserve: {fmtCpu(ciReserve.cpuMillicores)} / {fmtMem(ciReserve.memoryMiB)}
        </span>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-3 text-xs text-gray-400 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-green-500 inline-block" /> Requests (committed)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-orange-300 inline-block" /> CI Reserved</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-blue-300 inline-block" /> Limits (ceiling)</span>
      </div>

      <ResourceRow
        label="CPU"
        allocatable={allocatable.cpuMillicores}
        requests={requests.cpuMillicores}
        ciReserve={ciReserve.cpuMillicores}
        limits={limits.cpuMillicores}
        unitFn={fmtCpu}
      />
      <ResourceRow
        label="Memory"
        allocatable={allocatable.memoryMiB}
        requests={requests.memoryMiB}
        ciReserve={ciReserve.memoryMiB}
        limits={limits.memoryMiB}
        unitFn={fmtMem}
      />
      <PodRow pods={requests.pods} allocatable={allocatable.pods} />

      {/* Namespace breakdown */}
      {namespaces.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Namespace Breakdown</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b">
                  <th className="text-left pb-1 font-medium">Namespace</th>
                  <th className="text-right pb-1 font-medium">Pods</th>
                  <th className="text-right pb-1 font-medium">Req CPU</th>
                  <th className="text-right pb-1 font-medium">Lim CPU</th>
                  <th className="text-right pb-1 font-medium">Req Mem</th>
                  <th className="text-right pb-1 font-medium">Lim Mem</th>
                </tr>
              </thead>
              <tbody>
                {namespaces.map(({ ns, pods, reqCpu, reqMem, limCpu, limMem }) => (
                  <tr key={ns} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-1 text-gray-700 truncate max-w-[120px]">{ns}</td>
                    <td className="py-1 text-right text-gray-600">{pods}</td>
                    <td className="py-1 text-right text-gray-600">{fmtCpu(reqCpu)}</td>
                    <td className="py-1 text-right text-blue-400">{limCpu ? fmtCpu(limCpu) : '—'}</td>
                    <td className="py-1 text-right text-gray-600">{fmtMem(reqMem)}</td>
                    <td className="py-1 text-right text-blue-400">{limMem ? fmtMem(limMem) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NodeCapacity() {
  const [nodes, setNodes] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  async function load() {
    try {
      const res = await fetch('/api/nodes');
      if (!res.ok) throw new Error(await res.text());
      setNodes(await res.json());
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <div className="p-8 text-gray-400 text-center">Loading node data...</div>;
  if (error)   return <div className="p-8 text-red-500 text-center">Error: {error}</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-700">Node Scheduling Capacity</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Committed (requests) + CI reserved vs allocatable · Limits shown separately
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-400">Updated {lastUpdated.toLocaleTimeString()}</span>
          )}
          <button
            onClick={load}
            className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {nodes.map((n) => <NodeCard key={n.name} node={n} />)}
      </div>
      <p className="text-xs text-gray-400 mt-4 text-center">
        Auto-refreshes every 30s · CI reserve tunable via <code>CI_RESERVE_CPU_MILLICORES</code> / <code>CI_RESERVE_MEMORY_MIB</code>
      </p>
    </div>
  );
}
