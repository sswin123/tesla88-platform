import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import {
  getStaffById,
  updateStaffMember,
  countActiveSuperAdmins,
} from '@/lib/repositories/admin_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

const ASSIGNABLE_ROLES = ['ADMIN', 'SUPERVISOR', 'FINANCE', 'SUPPORT', 'CS'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('staff.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const target = await getStaffById(id);
  if (!target) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });

  if (target.role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Cannot edit SUPER_ADMIN accounts' }, { status: 403 });
  }

  let body: { role?: string; password?: string; is_active?: boolean; display_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.role !== undefined) {
    if (body.role === 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Cannot assign SUPER_ADMIN role' }, { status: 403 });
    }
    if (!ASSIGNABLE_ROLES.includes(body.role)) {
      return NextResponse.json(
        { error: `role must be one of: ${ASSIGNABLE_ROLES.join(', ')}` },
        { status: 400 }
      );
    }
    if (target.id === payload.sub) {
      return NextResponse.json({ error: 'Cannot change your own role' }, { status: 403 });
    }
  }

  if (body.is_active === false && target.role === 'SUPER_ADMIN') {
    const activeCount = await countActiveSuperAdmins();
    if (activeCount <= 1) {
      return NextResponse.json({ error: 'Cannot disable the last active SUPER_ADMIN' }, { status: 403 });
    }
  }

  if (body.password !== undefined && body.password.length < 6) {
    return NextResponse.json({ error: 'password must be at least 6 characters' }, { status: 400 });
  }

  const updated = await updateStaffMember(id, {
    role:         body.role,
    is_active:    body.is_active,
    password:     body.password,
    display_name: body.display_name,
  });

  const changes: Record<string, unknown> = {};
  if (body.role !== undefined)        changes.role = body.role;
  if (body.is_active !== undefined)   changes.is_active = body.is_active;
  if (body.display_name !== undefined) changes.display_name = body.display_name;
  if (body.password !== undefined)    changes.password_reset = true;

  logAudit({
    admin_id:    payload.sub,
    action:      'STAFF_UPDATED',
    target_type: 'admin',
    target_id:   id,
    new_value:   changes,
  }).catch(() => {});

  return NextResponse.json({ ok: true, member: updated });
}
