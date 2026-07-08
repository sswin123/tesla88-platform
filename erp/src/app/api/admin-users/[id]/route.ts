import { NextRequest, NextResponse } from 'next/server';
import { updateAdmin } from '@/lib/repositories/admin_repo';
import type { AdminRole } from '@/lib/types';
import { logAudit } from '@/lib/repositories/audit_repo';
import { requirePermission } from '@/lib/require_permission';

const VALID_ROLES: AdminRole[] = ['SUPER_ADMIN', 'ADMIN', 'CS', 'FINANCE', 'SUPERVISOR', 'SUPPORT'];

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

  let body: { role?: string; is_active?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.role !== undefined && !VALID_ROLES.includes(body.role as AdminRole)) {
    return NextResponse.json(
      { error: `role must be one of: ${VALID_ROLES.join(', ')}` },
      { status: 400 }
    );
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
