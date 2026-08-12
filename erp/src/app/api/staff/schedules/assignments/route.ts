import { NextResponse } from 'next/server';
import { requirePermissionStrict } from '@/lib/require_permission';
import { createAssignment, getTargetStaffRole, ScheduleOverlapError } from '@/lib/repositories/staff_schedule_repo';
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
    staffId?: number; templateId?: number; effectiveFrom?: string; effectiveTo?: string | null;
  };
  if (!body.staffId || !body.templateId || !body.effectiveFrom) {
    return NextResponse.json({ error: 'staffId, templateId, effectiveFrom are required' }, { status: 400 });
  }

  // SUPER_ADMIN Assignment protection: the target staff's real role always
  // comes from the DB, never from the request body (which cannot be
  // trusted). A SUPER_ADMIN viewer is exempt; any other viewer may not
  // create an Assignment targeting a SUPER_ADMIN account.
  if (auth.payload.role !== 'SUPER_ADMIN') {
    const targetRole = await getTargetStaffRole(body.staffId);
    if (targetRole === 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  let id: number;
  try {
    // createdBy always comes from the authenticated JWT — never from the
    // request body, which cannot be trusted to identify the real actor.
    id = await createAssignment({
      staffId: body.staffId, templateId: body.templateId, effectiveFrom: body.effectiveFrom,
      effectiveTo: body.effectiveTo ?? null, createdBy: auth.payload.sub,
    });
  } catch (err) {
    if (err instanceof ScheduleOverlapError) return NextResponse.json({ error: err.message }, { status: 409 });
    if (isRepoValidationError(err)) return NextResponse.json({ error: err.message }, { status: 400 });
    if (isForeignKeyViolation(err)) return NextResponse.json({ error: 'staffId or templateId does not exist' }, { status: 400 });
    console.error('[staff/schedules/assignments POST]', err);
    return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500 });
  }

  logAudit({
    admin_id: auth.payload.sub,
    action: 'SCHEDULE_ASSIGNMENT_CREATED',
    target_type: 'schedule_assignment',
    target_id: id,
    new_value: { staffId: body.staffId, templateId: body.templateId, effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo ?? null },
  }).catch(() => {});

  return NextResponse.json({ ok: true, id });
}
