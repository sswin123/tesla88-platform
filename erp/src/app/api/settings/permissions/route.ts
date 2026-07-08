import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { can, invalidateCache } from '@/lib/permission_engine';
import { getRolePermissions, setRolePermission } from '@/lib/repositories/permissions_repo';
import { logAudit } from '@/lib/repositories/audit_repo';
import { MANAGEABLE_ROLES } from '@/lib/permission-defs';

async function requirePermissionManager() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return null;
  const allowed = await can(payload.role, 'staff.manage');
  if (!allowed) return null;
  return payload;
}

export async function GET(_request: NextRequest) {
  const payload = await requirePermissionManager();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await getRolePermissions();

  const matrix: Record<string, string[]> = {};
  for (const row of rows) {
    if (!row.granted) continue;
    if (!matrix[row.role]) matrix[row.role] = [];
    matrix[row.role].push(row.permission);
  }

  return NextResponse.json({ roles: MANAGEABLE_ROLES, matrix });
}

export async function PATCH(request: NextRequest) {
  const payload = await requirePermissionManager();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { role?: string; permission?: string; granted?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { role, permission, granted } = body;

  if (!role || !permission || granted === undefined) {
    return NextResponse.json({ error: 'role, permission, and granted are required' }, { status: 400 });
  }

  if (role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Cannot modify SUPER_ADMIN permissions' }, { status: 403 });
  }

  const old = granted ? false : true;
  await setRolePermission(role, permission, granted, payload.username);
  invalidateCache();

  logAudit({
    admin_id:    payload.sub,
    action:      'PERMISSION_UPDATED',
    target_type: 'role_permissions',
    old_value:   { role, permission, granted: old },
    new_value:   { role, permission, granted },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
