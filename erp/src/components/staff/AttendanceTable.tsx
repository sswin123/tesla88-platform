import { AttendanceStatusBadge } from './AttendanceStatusBadge';
import { formatAttendanceDate, formatClockTime } from '@/lib/format-date';
import type { ReportedAttendanceStatus } from '@/lib/attendance-rules';

export interface AttendanceTableRow {
  id: number; staff_id: number; display_name: string | null; department: string | null;
  attendance_date: string; login_time: string | null; logout_time: string | null;
  working_minutes: number; late_minutes: number; early_leave_minutes: number;
  attendance_status: ReportedAttendanceStatus;
}

export function AttendanceTable({
  rows, timezone, onSelect,
}: {
  rows: AttendanceTableRow[]; timezone: string; onSelect: (id: number) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-gray-500 border-b">
          <th className="py-2">Staff</th><th>Department</th><th>Date</th>
          <th>Check-in</th><th>Check-out</th><th>Late</th><th>Early</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} onClick={() => onSelect(r.id)} className="border-b hover:bg-gray-50 cursor-pointer">
            <td className="py-2">{r.display_name ?? '—'}</td>
            <td>{r.department ?? '—'}</td>
            <td>{formatAttendanceDate(r.attendance_date)}</td>
            <td>{formatClockTime(r.login_time, timezone)}</td>
            <td>{formatClockTime(r.logout_time, timezone)}</td>
            <td>{r.late_minutes > 0 ? `${r.late_minutes}m` : '—'}</td>
            <td>{r.early_leave_minutes > 0 ? `${r.early_leave_minutes}m` : '—'}</td>
            <td><AttendanceStatusBadge status={r.attendance_status} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
