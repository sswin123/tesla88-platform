import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getRolePermissions } from '@/lib/repositories/permissions_repo';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (payload.role === 'SUPER_ADMIN') {
    return NextResponse.json({
      sub:         payload.sub,
      username:    payload.username,
      role:        payload.role,
      isSuperAdmin:true,
      permissions: [] as string[],
    });
  }

  let permissions: string[] = [];
  try {
    const rows = await getRolePermissions();
    permissions = rows
      .filter((r) => r.role === payload.role && r.granted)
      .map((r) => r.permission);
  } catch {
    // DB offline — return empty permissions (fail-safe: deny access)
  }

  return NextResponse.json({
    sub:          payload.sub,
    username:     payload.username,
    role:         payload.role,
    isSuperAdmin: false,
    permissions,
  });
}
