import { NextResponse } from 'next/server';
import { requirePermissionStrict } from '@/lib/require_permission';
import { createOverride, getTargetStaffRole, ScheduleOverrideConflictError } from '@/lib/repositories/staff_schedule_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

function isRepoValidationError(err: unknown): err is Error {
  return err instanceof Error && err.message.startsWith('staff_schedule_repo:');
}

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === '23503';
}

export async function POST(request: Request) {
  const auth = await requirePermissionStrict('staff.schedule.manage');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: auth.status });
  }

  const body = await request.json() as {
    staffId?: number; overrideDate?: string; startTime?: string; endTime?: string;
    isRestDay?: boolean; lateGraceMinutes?: number; reason?: string;
  };
  if (!body.staffId || !body.overrideDate) {
    return NextResponse.json({ error: 'staffId and overrideDate are required' }, { status: 400 });
  }
  const isRestDay = body.isRestDay ?? false;
  if (!isRestDay && (!body.startTime || !body.endTime)) {
    return NextResponse.json({ error: 'startTime and endTime are required unless isRestDay is true' }, { status: 400 });
  }

  // SUPER_ADMIN Override protection: the target staff's real role always
  // comes from the DB, never from the request body (which cannot be
  // trusted). A SUPER_ADMIN viewer is exempt; any other viewer may not
  // create an Override targeting a SUPER_ADMIN account.
  if (auth.payload.role !== 'SUPER_ADMIN') {
    const targetRole = await getTargetStaffRole(body.staffId);
    if (targetRole === 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const startTime = isRestDay ? null : body.startTime!;
  const endTime = isRestDay ? null : body.endTime!;

  let id: number;
  try {
    // createdBy always comes from the authenticated JWT — never from the
    // request body, which cannot be trusted to identify the real actor.
    id = await createOverride({
      staffId: body.staffId, overrideDate: body.overrideDate,
      startTime, endTime, isRestDay,
      lateGraceMinutes: body.lateGraceMinutes ?? null, reason: body.reason ?? null,
      createdBy: auth.payload.sub,
    });
  } catch (err) {
    if (err instanceof ScheduleOverrideConflictError) return NextResponse.json({ error: err.message }, { status: 409 });
    if (isRepoValidationError(err)) return NextResponse.json({ error: err.message }, { status: 400 });
    if (isForeignKeyViolation(err)) return NextResponse.json({ error: 'staffId does not exist' }, { status: 400 });
    console.error('[staff/schedules/overrides POST]', err);
    return NextResponse.json({ error: 'Failed to create override' }, { status: 500 });
  }

  logAudit({
    admin_id: auth.payload.sub,
    action: 'SCHEDULE_OVERRIDE_CREATED',
    target_type: 'schedule_override',
    target_id: id,
    new_value: {
      staffId: body.staffId, overrideDate: body.overrideDate, isRestDay,
      startTime, endTime, lateGraceMinutes: body.lateGraceMinutes ?? null, reason: body.reason ?? null,
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, id });
}
