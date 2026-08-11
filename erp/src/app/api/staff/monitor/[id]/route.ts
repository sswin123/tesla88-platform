import { NextResponse } from 'next/server';
import { requirePermissionStrict } from '@/lib/require_permission';
import { getStaffMonitorRow, getRecentActivity } from '@/lib/repositories/staff_monitor_repo';
import { resolveDisplayStatus } from '@/lib/staff-status';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionStrict('staff.livemonitor.view');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: auth.status });
  }

  const { id } = await params;
  const staffId = Number(id);
  if (!Number.isInteger(staffId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const row = await getStaffMonitorRow(staffId, auth.payload.role);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const recentActivity = await getRecentActivity(staffId, 20);
  return NextResponse.json({
    ...row,
    display_status: resolveDisplayStatus({ storedStatus: row.status, lastActivity: row.last_activity }),
    recent_activity: recentActivity,
  });
}
