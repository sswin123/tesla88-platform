// erp/src/components/staff/StaffTable.tsx
'use client';

import { useMemo, useState } from 'react';
import { StatusBadge } from './StatusBadge';
import { filterStaffRows } from '@/lib/staff-table-filters';
import { formatDuration } from '@/lib/format-duration';
import type { StaffMonitorSnapshot } from '@/hooks/useStaffMonitorStream';

export function StaffTable({
  staff,
  onSelect,
}: {
  staff: StaffMonitorSnapshot[];
  onSelect: (id: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');

  const departments = useMemo(
    () => Array.from(new Set(staff.map((s) => s.department).filter((d): d is string => !!d))),
    [staff]
  );

  const filtered = useMemo(
    () => filterStaffRows(staff, { search, status: statusFilter, department: departmentFilter }),
    [staff, search, statusFilter, departmentFilter]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search staff…"
          className="h-9 rounded-md border px-3 text-sm"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 rounded-md border px-2 text-sm">
          <option value="ALL">All Status</option>
          <option value="ONLINE">Online</option>
          <option value="IDLE">Idle</option>
          <option value="OFFLINE">Offline</option>
          <option value="DISCONNECTED">Disconnected</option>
        </select>
        <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="h-9 rounded-md border px-2 text-sm">
          <option value="ALL">All Departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Department</th>
              <th className="px-3 py-2 text-left">Role</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Current Page</th>
              <th className="px-3 py-2 text-left">Working Duration</th>
              <th className="px-3 py-2 text-left">IP</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => onSelect(s.id)}>
                <td className="px-3 py-2 font-medium">{s.display_name ?? s.erp_username}</td>
                <td className="px-3 py-2 text-gray-500">{s.department ?? '—'}</td>
                <td className="px-3 py-2 text-gray-500">{s.role}</td>
                <td className="px-3 py-2"><StatusBadge status={s.display_status} /></td>
                <td className="px-3 py-2 text-gray-500">{s.current_module ? `${s.current_module} / ${s.current_page ?? ''}` : '—'}</td>
                <td className="px-3 py-2 text-gray-500">{formatDuration(s.login_at)}</td>
                <td className="px-3 py-2 text-gray-400">{s.current_ip ?? '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No staff match the current filters</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
