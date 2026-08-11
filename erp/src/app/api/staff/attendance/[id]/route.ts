import { NextResponse } from 'next/server';
import { requirePermissionStrict } from '@/lib/require_permission';
import { getAttendanceDetail } from '@/lib/repositories/staff_attendance_repo';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionStrict('staff.attendance.view');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: auth.status });
  }

  const { id } = await params;
  const attendanceId = Number(id);
  if (!Number.isInteger(attendanceId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  // getAttendanceDetail() applies the same SUPER_ADMIN visibility rule as
  // the list route — a normal Admin requesting a SUPER_ADMIN's attendance
  // id gets null here (row excluded at the query level), surfacing as a
  // plain 404, same as any other nonexistent id.
  const row = await getAttendanceDetail(attendanceId, auth.payload.role);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json(row);
}
