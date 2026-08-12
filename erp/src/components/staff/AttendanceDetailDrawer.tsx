'use client';

import { useEffect, useState } from 'react';
import { AttendanceStatusBadge } from './AttendanceStatusBadge';
import { formatAttendanceDate, formatClockTime } from '@/lib/format-date';
import { formatDuration } from '@/lib/format-duration';
import type { ReportedAttendanceStatus } from '@/lib/attendance-rules';

interface SessionRow {
  id: number; login_at: string; logout_at: string | null; checkout_source: string | null; working_minutes: number;
}
interface DetailResponse {
  id: number; display_name: string | null; department: string | null; attendance_date: string;
  login_time: string | null; logout_time: string | null; working_minutes: number;
  late_minutes: number; early_leave_minutes: number; attendance_status: ReportedAttendanceStatus;
  checkout_source: string | null; sessions: SessionRow[];
}

export function AttendanceDetailDrawer({
  attendanceId, timezone, onClose,
}: {
  attendanceId: number | null; timezone: string; onClose: () => void;
}) {
  const [detail, setDetail] = useState<DetailResponse | null>(null);

  useEffect(() => {
    if (attendanceId === null) { setDetail(null); return; }
    fetch(`/api/staff/attendance/${attendanceId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [attendanceId]);

  if (attendanceId === null) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white border-l shadow-xl p-4 overflow-y-auto z-40">
      <button onClick={onClose} className="text-sm text-gray-500 mb-4">Close ×</button>
      {!detail ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <>
          <h2 className="text-lg font-semibold">{detail.display_name ?? '—'}</h2>
          <p className="text-xs text-gray-500 mb-4">{detail.department ?? '—'} · {formatAttendanceDate(detail.attendance_date)}</p>
          <AttendanceStatusBadge status={detail.attendance_status} />

          {detail.checkout_source === 'TIMEOUT' && (
            <p className="mt-3 text-xs text-red-600 font-medium">
              No normal logout was recorded — the last known activity time is shown below (INCOMPLETE / TIMEOUT).
            </p>
          )}

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Check-in</dt><dd>{formatClockTime(detail.login_time, timezone)}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Check-out</dt><dd>{formatClockTime(detail.logout_time, timezone)}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Late</dt><dd>{detail.late_minutes}m</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Early Leave</dt><dd>{detail.early_leave_minutes}m</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Working Time</dt><dd>{formatDuration(new Date(Date.now() - detail.working_minutes * 60_000).toISOString())}</dd></div>
          </dl>

          <h3 className="mt-6 mb-2 text-xs font-semibold uppercase text-gray-400">Sessions</h3>
          <ul className="space-y-2">
            {detail.sessions.map((s) => (
              <li key={s.id} className="text-xs border rounded p-2">
                <div>{formatClockTime(s.login_at, timezone)} → {s.checkout_source === 'TIMEOUT' ? 'TIMEOUT (no logout)' : formatClockTime(s.logout_at, timezone)}</div>
                <div className="text-gray-400">{s.working_minutes}m · {s.checkout_source ?? 'in progress'}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
