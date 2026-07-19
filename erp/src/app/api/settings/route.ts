import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getAllSettings, setSettings } from '@/lib/repositories/settings_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function GET() {
  const payload = await requirePermission('website.settings');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const settings = await getAllSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(request: NextRequest) {
  const payload = await requirePermission('website.settings');
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
