// erp/src/app/(dashboard)/staff/live-monitor/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { usePermissionGuard } from '@/hooks/use-permission-guard';
import { useStaffMonitorStream, type StaffMonitorSnapshot } from '@/hooks/useStaffMonitorStream';
import { SummaryCards } from '@/components/staff/SummaryCards';
import { StaffTable } from '@/components/staff/StaffTable';
import { StaffDetailDrawer } from '@/components/staff/StaffDetailDrawer';

export default function LiveMonitorPage() {
  const { checking, denied } = usePermissionGuard('staff.livemonitor.view');
  const [initial, setInitial] = useState<StaffMonitorSnapshot[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (checking || denied) return;
    fetch('/api/staff/monitor')
      .then((r) => (r.ok ? r.json() : { staff: [] }))
      .then((d: { staff: StaffMonitorSnapshot[] }) => setInitial(d.staff))
      .catch(() => setLoadError(true))
      .finally(() => setLoaded(true));
  }, [checking, denied]);

  const staff = useStaffMonitorStream(initial);

  if (checking) {
    return <div className="flex h-64 items-center justify-center text-gray-400 text-sm">Loading…</div>;
  }
  if (denied) {
    return <div className="flex h-64 items-center justify-center text-red-400 text-sm">403 — You don&apos;t have permission to view this page.</div>;
  }

  return (
    <div className="space-y-6 pb-8">
      <h1 className="text-2xl font-bold">Live Monitor</h1>
      {!loaded ? (
        <p className="text-xs text-gray-400">Loading staff…</p>
      ) : loadError ? (
        <div className="flex h-64 items-center justify-center text-red-400 text-sm">
          Failed to load staff monitor. Refresh to try again.
        </div>
      ) : (
        <>
          <SummaryCards staff={staff} />
          <StaffTable staff={staff} onSelect={setSelectedId} />
        </>
      )}
      <StaffDetailDrawer staffId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
