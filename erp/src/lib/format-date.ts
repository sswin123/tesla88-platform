/**
 * Display-only date/time formatting for Attendance UI. Never used for
 * business logic — attendance_date and schedule-window math live
 * exclusively in attendance-rules.ts (spec §22).
 */
export function formatAttendanceDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(dt);
}

export function formatClockTime(iso: string | null, timezone: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(new Date(iso));
}
