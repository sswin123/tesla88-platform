import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { listStaff, createStaffMember } from '@/lib/repositories/admin_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

const ASSIGNABLE_ROLES = ['ADMIN', 'SUPERVISOR', 'FINANCE', 'SUPPORT', 'CS'];

export async function GET() {
  const payload = await requirePermission('staff.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const staff = await listStaff();
  return NextResponse.json({ staff });
}

export async function POST(request: NextRequest) {
  const payload = await requirePermission('staff.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { erp_username?: string; display_name?: string; telegram_id?: string; role?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.erp_username?.trim()) {
    return NextResponse.json({ error: 'erp_username is required' }, { status: 400 });
  }
  if (!body.password || body.password.length < 6) {
    return NextResponse.json({ error: 'password must be at least 6 characters' }, { status: 400 });
  }
  if (!body.role || !ASSIGNABLE_ROLES.includes(body.role)) {
    return NextResponse.json(
      { error: `role must be one of: ${ASSIGNABLE_ROLES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const member = await createStaffMember({
      erp_username:      body.erp_username.trim(),
      display_name:      body.display_name?.trim() || body.erp_username.trim(),
      telegram_id:       body.telegram_id?.trim() || undefined,
      role:              body.role,
      password:          body.password,
      added_by_username: payload.username,
    });
    logAudit({
      admin_id:    payload.sub,
      action:      'STAFF_CREATED',
      target_type: 'admin',
      target_id:   member.id,
      new_value:   { erp_username: member.erp_username, role: member.role },
    }).catch(() => {});
    return NextResponse.json({ ok: true, member }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
    }
    console.error('[settings/staff POST]', err);
    return NextResponse.json({ error: 'Failed to create staff member' }, { status: 500 });
  }
}
