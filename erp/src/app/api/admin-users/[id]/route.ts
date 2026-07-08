import { NextRequest, NextResponse } from 'next/server';
import { updateAdmin, getStaffById, countActiveSuperAdmins } from '@/lib/repositories/admin_repo';
import type { AdminRole } from '@/lib/types';
import { logAudit } from '@/lib/repositories/audit_repo';
import { requirePermission } from '@/lib/require_permission';

const VALID_ROLES: AdminRole[] = ['ADMIN', 'CS', 'FINANCE', 'SUPERVISOR', 'SUPPORT'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('staff.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const adminId = parseInt(id, 10);
  if (isNaN(adminId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const target = await getStaffById(adminId);
  if (!target) return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
  if (target.role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Cannot edit SUPER_ADMIN accounts' }, { status: 403 });
  }

  let body: { role?: string; is_active?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.role !== undefined) {
    if (!VALID_ROLES.includes(body.role as AdminRole)) {
      return NextResponse.json(
        { error: `role must be one of: ${VALID_ROLES.join(', ')}` },
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

  const updated = await updateAdmin(adminId, {
    role:      body.role,
    is_active: body.is_active,
  });

  if (!updated) {
    return NextResponse.json({ error: 'Admin not found or no changes' }, { status: 404 });
  }

  logAudit({
    admin_id: payload.sub,
    action: 'ADMIN_UPDATED',
    target_type: 'admin',
    target_id: adminId,
    new_value: body,
  }).catch(() => {});
  return NextResponse.json(updated);
}
