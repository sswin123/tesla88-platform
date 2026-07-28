interface CompletionBarProps {
  percent: number | null;
  size?: 'sm' | 'md';
}

function getBarColor(percent: number): string {
  if (percent === 100) return 'bg-emerald-500';
  if (percent >= 80)   return 'bg-yellow-400';
  if (percent >= 51)   return 'bg-amber-400';
  return 'bg-rose-500';
}

export function CompletionBar({ percent, size = 'md' }: CompletionBarProps) {
  if (percent === null) return null;

  const clamped = Math.max(0, Math.min(100, percent));
  const barColor = getBarColor(clamped);

  if (size === 'sm') {
    return (
      <div
        className="w-16 h-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
        title={`${clamped}% complete`}
      >
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex-shrink-0">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {clamped}% complete
      </span>
    </div>
  );
}
