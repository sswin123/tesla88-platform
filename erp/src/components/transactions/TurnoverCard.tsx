'use client';

interface TurnoverCardProps {
  required: number;
  completed: number;
}

export default function TurnoverCard({ required, completed }: TurnoverCardProps) {
  if (required <= 0) return null;

  const pct = Math.min(100, (completed / required) * 100);
  const remaining = Math.max(0, required - completed);

  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Active Turnover Requirement
      </h2>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Required: RM {required.toFixed(2)}</span>
          <span className="text-gray-500">Completed: RM {completed.toFixed(2)}</span>
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>{pct.toFixed(0)}% completed</span>
          <span>Remaining: RM {remaining.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
