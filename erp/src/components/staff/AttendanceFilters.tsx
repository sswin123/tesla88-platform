'use client';

import type { ReportedAttendanceStatus } from '@/lib/attendance-rules';

export interface AttendanceFiltersValue {
  dateFrom: string; dateTo: string; staffId: number | null; department: string; status: ReportedAttendanceStatus | '';
}

const STATUS_OPTIONS: ReportedAttendanceStatus[] = [
  'PRESENT', 'LATE', 'EARLY_LEAVE', 'LATE_AND_EARLY', 'INCOMPLETE', 'WORKED_ON_REST_DAY', 'ABSENT', 'REST_DAY',
];

export function AttendanceFilters({
  value, onChange,
}: {
  value: AttendanceFiltersValue;
  onChange: (next: AttendanceFiltersValue) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3 items-end">
      <label className="flex flex-col text-xs text-gray-500 gap-1">
        From
        <input type="date" value={value.dateFrom} onChange={(e) => onChange({ ...value, dateFrom: e.target.value })}
          className="border rounded px-2 py-1.5 text-sm" />
      </label>
      <label className="flex flex-col text-xs text-gray-500 gap-1">
        To
        <input type="date" value={value.dateTo} onChange={(e) => onChange({ ...value, dateTo: e.target.value })}
          className="border rounded px-2 py-1.5 text-sm" />
      </label>
      <label className="flex flex-col text-xs text-gray-500 gap-1">
        Department
        <input type="text" value={value.department} onChange={(e) => onChange({ ...value, department: e.target.value })}
          placeholder="All" className="border rounded px-2 py-1.5 text-sm w-32" />
      </label>
      <label className="flex flex-col text-xs text-gray-500 gap-1">
        Status
        <select value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value as ReportedAttendanceStatus | '' })}
          className="border rounded px-2 py-1.5 text-sm">
          <option value="">All</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
    </div>
  );
}
