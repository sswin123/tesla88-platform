import { NextResponse } from 'next/server';
import { requirePermissionStrict } from '@/lib/require_permission';
import { getMonitorSnapshot } from '@/lib/repositories/staff_monitor_repo';
import { resolveDisplayStatus } from '@/lib/staff-status';

export async function GET() {
  const auth = await requirePermissionStrict('staff.livemonitor.view');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: auth.status });
  }

  const rows = await getMonitorSnapshot();
  const staff = rows.map((r) => ({
    ...r,
    display_status: resolveDisplayStatus({ storedStatus: r.status, lastActivity: r.last_activity }),
  }));
  return NextResponse.json({ staff });
}
