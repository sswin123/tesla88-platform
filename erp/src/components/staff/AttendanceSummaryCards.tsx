import { formatDuration } from '@/lib/format-duration';

export interface AttendanceCounts {
  PRESENT?: number; LATE?: number; EARLY_LEAVE?: number; LATE_AND_EARLY?: number;
  INCOMPLETE?: number; WORKED_ON_REST_DAY?: number; ABSENT?: number; REST_DAY?: number;
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-white px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

export function AttendanceSummaryCards({ counts, totalWorkingMinutes }: { counts: AttendanceCounts; totalWorkingMinutes: number }) {
  const lateCount = (counts.LATE ?? 0) + (counts.LATE_AND_EARLY ?? 0);
  const earlyCount = (counts.EARLY_LEAVE ?? 0) + (counts.LATE_AND_EARLY ?? 0);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <Card label="Late" value={lateCount} />
      <Card label="Early Leave" value={earlyCount} />
      <Card label="Absent" value={counts.ABSENT ?? 0} />
      <Card label="Rest Day" value={counts.REST_DAY ?? 0} />
      <Card label="Incomplete" value={counts.INCOMPLETE ?? 0} />
      <Card label="Total Working" value={formatDuration(new Date(Date.now() - totalWorkingMinutes * 60_000).toISOString())} />
    </div>
  );
}
