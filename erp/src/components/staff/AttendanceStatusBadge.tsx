import type { ReportedAttendanceStatus } from '@/lib/attendance-rules';

const STYLES: Record<ReportedAttendanceStatus, string> = {
  PRESENT:            'bg-green-100 text-green-800',
  LATE:                'bg-yellow-100 text-yellow-800',
  EARLY_LEAVE:         'bg-yellow-100 text-yellow-800',
  LATE_AND_EARLY:      'bg-orange-100 text-orange-800',
  INCOMPLETE:          'bg-red-100 text-red-800',
  WORKED_ON_REST_DAY:  'bg-blue-100 text-blue-800',
  ABSENT:              'bg-red-100 text-red-800',
  REST_DAY:            'bg-gray-100 text-gray-600',
};

const LABELS: Record<ReportedAttendanceStatus, string> = {
  PRESENT: 'Present', LATE: 'Late', EARLY_LEAVE: 'Early Leave', LATE_AND_EARLY: 'Late + Early',
  INCOMPLETE: 'Incomplete', WORKED_ON_REST_DAY: 'Worked (Rest Day)', ABSENT: 'Absent', REST_DAY: 'Rest Day',
};

export function AttendanceStatusBadge({ status }: { status: ReportedAttendanceStatus }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
