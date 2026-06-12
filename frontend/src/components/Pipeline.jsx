const stageColors = {
  success: 'bg-green-500',
  failure: 'bg-red-500',
  running: 'bg-blue-500 animate-pulse',
  pending: 'bg-yellow-400',
  skipped: 'bg-gray-200',
  grey:    'bg-gray-200',
};

const stageLabels = ['Code', 'Build', 'Test', 'Deploy'];

export default function Pipeline({ stages = [] }) {
  return (
    <div className="flex items-center gap-1">
      {stageLabels.map((label, i) => {
        const status = stages[i] || 'grey';
        return (
          <div key={label} className="flex items-center gap-1">
            <div className="relative group">
              <div className={`w-6 h-6 rounded-full ${stageColors[status]}`} />
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                {label}
              </div>
            </div>
            {i < stageLabels.length - 1 && (
              <div className="w-4 h-px bg-gray-300" />
            )}
          </div>
        );
      })}
    </div>
  );
}
