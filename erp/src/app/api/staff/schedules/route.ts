import { NextResponse } from 'next/server';
import { requirePermissionStrict } from '@/lib/require_permission';
import { createTemplate, listTemplates } from '@/lib/repositories/staff_schedule_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

/** Every validation Error thrown by staff_schedule_repo.ts's createTemplate()/
 *  updateTemplate() (invalid time, working_days, grace, etc.) is prefixed this
 *  way — confirmed by reading the file, not guessed. Anything else (DB outage,
 *  etc.) is a genuine unexpected error and must not be silently mapped to 400. */
function isRepoValidationError(err: unknown): err is Error {
  return err instanceof Error && err.message.startsWith('staff_schedule_repo:');
}

export async function GET() {
  const auth = await requirePermissionStrict('staff.schedule.manage');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: auth.status });
  }
  return NextResponse.json({ templates: await listTemplates() });
}

export async function POST(request: Request) {
  const auth = await requirePermissionStrict('staff.schedule.manage');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: auth.status });
  }

  const body = await request.json() as {
    name?: string; startTime?: string; endTime?: string; workingDays?: number[]; lateGraceMinutes?: number;
  };
  if (!body.name || !body.startTime || !body.endTime || !body.workingDays) {
    return NextResponse.json({ error: 'name, startTime, endTime, workingDays are required' }, { status: 400 });
  }

  let id: number;
  try {
    // createdBy always comes from the authenticated JWT — never from the
    // request body, which cannot be trusted to identify the real actor.
    id = await createTemplate({
      name: body.name, startTime: body.startTime, endTime: body.endTime,
      workingDays: body.workingDays, lateGraceMinutes: body.lateGraceMinutes ?? 5,
      createdBy: auth.payload.sub,
    });
  } catch (err) {
    if (isRepoValidationError(err)) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('[staff/schedules POST]', err);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }

  logAudit({
    admin_id: auth.payload.sub,
    action: 'SCHEDULE_TEMPLATE_CREATED',
    target_type: 'schedule_template',
    target_id: id,
    new_value: { name: body.name, startTime: body.startTime, endTime: body.endTime, workingDays: body.workingDays, lateGraceMinutes: body.lateGraceMinutes ?? 5 },
  }).catch(() => {});

  return NextResponse.json({ ok: true, id });
}
