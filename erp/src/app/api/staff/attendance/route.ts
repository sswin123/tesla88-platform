import { NextResponse } from 'next/server';
import { requirePermissionStrict } from '@/lib/require_permission';
import { listAttendance } from '@/lib/repositories/staff_attendance_repo';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUSES = ['PRESENT', 'LATE', 'EARLY_LEAVE', 'LATE_AND_EARLY', 'INCOMPLETE', 'WORKED_ON_REST_DAY'];

export async function GET(request: Request) {
  const auth = await requirePermissionStrict('staff.attendance.view');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  const staffIdParam = searchParams.get('staff_id');
  const department = searchParams.get('department');
  const status = searchParams.get('status');
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = 20;
  const offset = (page - 1) * limit;

  if (dateFrom !== null && !DATE_RE.test(dateFrom)) {
    return NextResponse.json({ error: 'invalid date_from' }, { status: 400 });
  }
  if (dateTo !== null && !DATE_RE.test(dateTo)) {
    return NextResponse.json({ error: 'invalid date_to' }, { status: 400 });
  }

  let staffId: number | null = null;
  if (staffIdParam !== null) {
    staffId = Number(staffIdParam);
    if (!Number.isInteger(staffId)) {
      return NextResponse.json({ error: 'invalid staff_id' }, { status: 400 });
    }
  }

  // Only the 6 values ever actually persisted (migration 094's CHECK
  // constraint) are valid here. ABSENT/REST_DAY are Reporting-layer-derived
  // (Task 15) and never appear as a real attendance_status value, so
  // rejecting them with 400 gives a clearer signal than silently returning
  // an empty page.
  if (status !== null && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }

  const { rows, total } = await listAttendance({
    dateFrom,
    dateTo,
    staffId,
    department,
    status,
    viewerRole: auth.payload.role,
    limit,
    offset,
  });

  return NextResponse.json({ data: rows, total, page, limit });
}
