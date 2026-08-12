// erp/src/components/staff/StaffMonitorWidget.tsx
'use client';

import { useEffect, useState } from 'react';
import { usePermissionGuard } from '@/hooks/use-permission-guard';
import { StatsCard } from '@/components/stats-card';
import type { StaffMonitorSnapshot } from '@/hooks/useStaffMonitorStream';

export function StaffMonitorWidget() {
  const { checking, denied } = usePermissionGuard('staff.livemonitor.view');
  const [staff, setStaff] = useState<StaffMonitorSnapshot[]>([]);

  useEffect(() => {
    if (checking || denied) return;
    fetch('/api/staff/monitor')
      .then((r) => (r.ok ? r.json() : { staff: [] }))
      .then((d: { staff: StaffMonitorSnapshot[] }) => setStaff(d.staff))
      .catch(() => {});
  }, [checking, denied]);

  if (checking || denied) return null;

  const online  = staff.filter((s) => s.display_status === 'ONLINE').length;
  const idle    = staff.filter((s) => s.display_status === 'IDLE').length;
  const offline = staff.filter((s) => s.display_status === 'OFFLINE' || s.display_status === 'DISCONNECTED').length;

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Staff Monitoring</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <a href="/staff/live-monitor"><StatsCard title="Online Staff"  value={online}  description="Click to open Live Monitor" /></a>
        <a href="/staff/live-monitor"><StatsCard title="Idle Staff"    value={idle}    description="3–10 min inactive" /></a>
        <a href="/staff/live-monitor"><StatsCard title="Offline Staff" value={offline} description="Logged out or disconnected" /></a>
      </div>
    </section>
  );
}
