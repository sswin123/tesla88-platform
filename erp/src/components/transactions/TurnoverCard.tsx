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
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Active Turnover Requirement
      </h2>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Required: RM {required.toFixed(2)}</span>
          <span className="text-muted-foreground">Completed: RM {completed.toFixed(2)}</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{pct.toFixed(0)}% completed</span>
          <span>Remaining: RM {remaining.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
