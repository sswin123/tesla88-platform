import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getAllAdmins, createAdmin } from '@/lib/repositories/admin_repo';
import type { AdminRole } from '@/lib/types';

const VALID_ROLES: AdminRole[] = ['SUPER_ADMIN', 'ADMIN', 'CS', 'FINANCE', 'SUPERVISOR', 'SUPPORT'];

async function getSuperAdminPayload() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return null;
  if (payload.role !== 'SUPER_ADMIN') return null;
  return payload;
}

export async function GET() {
  const payload = await getSuperAdminPayload();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admins = await getAllAdmins();
  return NextResponse.json({ admins });
}

export async function POST(request: NextRequest) {
  const payload = await getSuperAdminPayload();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    erp_username?: string;
    telegram_id?: string;
    role?: string;
    password?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.erp_username) {
    return NextResponse.json({ error: 'erp_username is required' }, { status: 400 });
  }
  if (!body.password) {
    return NextResponse.json({ error: 'password is required' }, { status: 400 });
  }
  if (!body.role || !VALID_ROLES.includes(body.role as AdminRole)) {
    return NextResponse.json(
      { error: `role must be one of: ${VALID_ROLES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const admin = await createAdmin({
      erp_username:      body.erp_username,
      telegram_id:       body.telegram_id,
      role:              body.role,
      password:          body.password,
      added_by_username: payload.username,
    });
    return NextResponse.json(admin, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
    }
    console.error('[admin-users POST]', err);
    return NextResponse.json({ error: 'Failed to create admin' }, { status: 500 });
  }
}
