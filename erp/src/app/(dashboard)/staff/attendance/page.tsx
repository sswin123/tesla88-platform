'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePermissionGuard } from '@/hooks/use-permission-guard';
import { AttendanceFilters, type AttendanceFiltersValue } from '@/components/staff/AttendanceFilters';
import { AttendanceSummaryCards, type AttendanceCounts } from '@/components/staff/AttendanceSummaryCards';
import { AttendanceTable, type AttendanceTableRow } from '@/components/staff/AttendanceTable';
import { AttendanceDetailDrawer } from '@/components/staff/AttendanceDetailDrawer';
import { Button } from '@/components/ui/button';

const TODAY = new Date().toISOString().slice(0, 10);
const FIRST_OF_MONTH = `${TODAY.slice(0, 7)}-01`;

export default function AttendancePage() {
  const { checking, denied } = usePermissionGuard('staff.attendance.view');
  const [filters, setFilters] = useState<AttendanceFiltersValue>({
    dateFrom: FIRST_OF_MONTH, dateTo: TODAY, staffId: null, department: '', status: '',
  });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AttendanceTableRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<AttendanceCounts>({});
  const [totalWorkingMinutes, setTotalWorkingMinutes] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [timezone, setTimezone] = useState('Asia/Kuala_Lumpur'); // overwritten by the fetch below once it resolves

  useEffect(() => {
    fetch('/api/public/attendance-timezone')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { timezone: string } | null) => { if (d) setTimezone(d.timezone); })
      .catch(() => {});
  }, []);

  function handleFiltersChange(next: AttendanceFiltersValue) {
    setFilters(next);
    setPage(1);
  }

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    qs.set('date_from', filters.dateFrom);
    qs.set('date_to', filters.dateTo);
    if (filters.staffId) qs.set('staff_id', String(filters.staffId));
    if (filters.department) qs.set('department', filters.department);
    if (filters.status) qs.set('status', filters.status);
    qs.set('page', String(page));

    fetch(`/api/staff/attendance?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { data: AttendanceTableRow[]; total: number }) => { setRows(d.data); setTotal(d.total); })
      .catch(() => setLoadError(true));

    // Statistics uses the same date_from/date_to/staff_id/department scope — no `status` filter
    // (the summary cards show every status's count at once) and works with staffId/department
    // both empty, both set, or either alone (spec review: must support all-staff and department
    // views, not just a single selected staff member).
    const statsQs = new URLSearchParams();
    statsQs.set('date_from', filters.dateFrom);
    statsQs.set('date_to', filters.dateTo);
    if (filters.staffId) statsQs.set('staff_id', String(filters.staffId));
    if (filters.department) statsQs.set('department', filters.department);

    fetch(`/api/staff/attendance/statistics?${statsQs.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { rows: { totalWorkingMinutes: number }[]; byStatus: AttendanceCounts } | null) => {
        if (!d) return;
        setCounts(d.byStatus);
        setTotalWorkingMinutes(d.rows.reduce((sum, r) => sum + r.totalWorkingMinutes, 0));
      })
      .catch(() => {});
  }, [filters, page]);

  useEffect(() => { if (!checking && !denied) load(); }, [checking, denied, load]);

  if (checking) return <div className="flex h-64 items-center justify-center text-gray-400 text-sm">Loading…</div>;
  if (denied) return <div className="flex h-64 items-center justify-center text-red-400 text-sm">403 — You don&apos;t have permission to view this page.</div>;

  return (
    <div className="space-y-6 pb-8">
      <h1 className="text-2xl font-bold">Attendance</h1>
      <AttendanceFilters value={filters} onChange={handleFiltersChange} />
      <AttendanceSummaryCards counts={counts} totalWorkingMinutes={totalWorkingMinutes} />
      {/* Summary cards now always render — they show company-wide totals when no staff/department
          filter is set, narrowing automatically as filters.staffId/department are applied. */}
      {loadError ? (
        <div className="flex h-64 items-center justify-center text-red-400 text-sm">Failed to load attendance. Refresh to try again.</div>
      ) : (
        <>
          <AttendanceTable rows={rows} timezone={timezone} onSelect={setSelectedId} />
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Total: {total}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                Previous
              </Button>
              <span className="px-2 py-1 text-gray-500">Page {page}</span>
              <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={page * 20 >= total}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
      <AttendanceDetailDrawer attendanceId={selectedId} timezone={timezone} onClose={() => setSelectedId(null)} />
    </div>
  );
}
