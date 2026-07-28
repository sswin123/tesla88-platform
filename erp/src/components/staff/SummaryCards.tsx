// erp/src/components/staff/SummaryCards.tsx
import { StatsCard } from '@/components/stats-card';
import type { StaffMonitorSnapshot } from '@/hooks/useStaffMonitorStream';

export function SummaryCards({ staff }: { staff: StaffMonitorSnapshot[] }) {
  const online  = staff.filter((s) => s.display_status === 'ONLINE').length;
  const idle    = staff.filter((s) => s.display_status === 'IDLE').length;
  const offline = staff.filter((s) => s.display_status === 'OFFLINE' || s.display_status === 'DISCONNECTED').length;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatsCard title="Online Staff"    value={online}         description={`of ${staff.length} total`} />
      <StatsCard title="Idle Staff"      value={idle}           description="3–10 min inactive" />
      <StatsCard title="Offline Staff"   value={offline}        description="Logged out or disconnected" />
      <StatsCard title="Active Sessions" value={online + idle}  description="Currently logged in" />
    </div>
  );
}
