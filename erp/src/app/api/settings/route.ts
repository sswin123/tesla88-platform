import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getAllSettings, setSettings } from '@/lib/repositories/settings_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

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

  const settings = await getAllSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(request: NextRequest) {
  const payload = await getSuperAdminPayload();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Body must be an object of key-value pairs' }, { status: 400 });
  }

  await setSettings(body, payload.username);
  logAudit({
    admin_id: payload.sub,
    action: 'SETTINGS_UPDATED',
    target_type: 'system_settings',
    target_id: null,
    new_value: body,
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}
