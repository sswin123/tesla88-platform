import { NextResponse } from 'next/server';
import { requirePermissionStrict } from '@/lib/require_permission';
import { updateTemplate, deactivateTemplate } from '@/lib/repositories/staff_schedule_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

function isRepoValidationError(err: unknown): err is Error {
  return err instanceof Error && err.message.startsWith('staff_schedule_repo:');
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionStrict('staff.schedule.manage');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: auth.status });
  }

  const { id } = await params;
  const templateId = Number(id);
  if (!Number.isInteger(templateId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const patch = await request.json() as {
    name?: string; startTime?: string; endTime?: string; workingDays?: number[]; lateGraceMinutes?: number;
  };

  let row;
  try {
    row = await updateTemplate(templateId, patch);
  } catch (err) {
    if (isRepoValidationError(err)) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('[staff/schedules/[id] PATCH]', err);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  logAudit({
    admin_id: auth.payload.sub,
    action: 'SCHEDULE_TEMPLATE_UPDATED',
    target_type: 'schedule_template',
    target_id: templateId,
    new_value: patch,
  }).catch(() => {});

  return NextResponse.json({ ok: true, template: row });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionStrict('staff.schedule.manage');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: auth.status });
  }

  const { id } = await params;
  const templateId = Number(id);
  if (!Number.isInteger(templateId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const row = await deactivateTemplate(templateId);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  logAudit({
    admin_id: auth.payload.sub,
    action: 'SCHEDULE_TEMPLATE_DEACTIVATED',
    target_type: 'schedule_template',
    target_id: templateId,
    new_value: { is_active: false },
  }).catch(() => {});

  return NextResponse.json({ ok: true, template: row });
}
