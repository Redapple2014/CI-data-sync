const configs = {
  SUCCESS:  { label: 'Success',  cls: 'bg-green-100 text-green-700 border-green-200' },
  FAILURE:  { label: 'Failure',  cls: 'bg-red-100 text-red-700 border-red-200' },
  UNSTABLE: { label: 'Unstable', cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  BUILDING: { label: 'Building', cls: 'bg-blue-100 text-blue-700 border-blue-200 animate-pulse' },
  UNKNOWN:  { label: 'Unknown',  cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  merged:   { label: 'Merged',   cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  open:     { label: 'Open',     cls: 'bg-green-100 text-green-700 border-green-200' },
  draft:    { label: 'Draft',    cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  closed:   { label: 'Closed',   cls: 'bg-red-100 text-red-700 border-red-200' },
};

export default function StatusBadge({ status }) {
  const cfg = configs[status] || configs.UNKNOWN;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}
