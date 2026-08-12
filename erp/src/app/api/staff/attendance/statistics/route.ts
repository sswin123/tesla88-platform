import { NextResponse } from 'next/server';
import { requirePermissionStrict } from '@/lib/require_permission';
import { getAttendanceStatistics } from '@/lib/repositories/staff_attendance_repo';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const auth = await requirePermissionStrict('staff.attendance.view');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: 'date_from and date_to are required' }, { status: 400 });
  }
  if (!DATE_RE.test(dateFrom)) {
    return NextResponse.json({ error: 'invalid date_from' }, { status: 400 });
  }
  if (!DATE_RE.test(dateTo)) {
    return NextResponse.json({ error: 'invalid date_to' }, { status: 400 });
  }
  if (dateFrom > dateTo) {
    return NextResponse.json({ error: 'date_from must not be after date_to' }, { status: 400 });
  }

  const staffIdParam = searchParams.get('staff_id');
  let staffId: number | null = null;
  if (staffIdParam !== null) {
    staffId = Number(staffIdParam);
    if (!Number.isInteger(staffId)) {
      return NextResponse.json({ error: 'invalid staff_id' }, { status: 400 });
    }
  }
  const department = searchParams.get('department');

  const rows = await getAttendanceStatistics({
    dateFrom, dateTo, staffId, department, viewerRole: auth.payload.role,
  });

  const byStatus: Record<string, number> = {};
  const byDepartment: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + row.count;
    const dept = row.department ?? 'Unassigned';
    byDepartment[dept] = byDepartment[dept] ?? {};
    byDepartment[dept][row.status] = (byDepartment[dept][row.status] ?? 0) + row.count;
  }

  return NextResponse.json({ rows, byStatus, byDepartment });
}
