import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getSetting, setSettings } from '@/lib/repositories/settings_repo';

const DEFAULT_INTERVAL_MS = 3000;

export async function GET() {
  const payload = await requirePermission('livechat.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await getSetting('notification_reminder_interval_ms');
  const ms  = parseInt(raw ?? String(DEFAULT_INTERVAL_MS), 10);
  const reminder_interval_ms = (Number.isInteger(ms) && ms >= 1000 && ms <= 10000) ? ms : DEFAULT_INTERVAL_MS;
  return NextResponse.json({ reminder_interval_ms });
}

export async function PATCH(req: NextRequest) {
  const payload = await requirePermission('brand.settings');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { reminder_interval_ms?: unknown };
  const ms = body.reminder_interval_ms;
  if (typeof ms !== 'number' || !Number.isInteger(ms) || ms < 1000 || ms > 10000) {
    return NextResponse.json({ error: 'reminder_interval_ms must be an integer between 1000 and 10000' }, { status: 400 });
  }

  await setSettings(
    { notification_reminder_interval_ms: String(ms) },
    payload.username
  );
  return NextResponse.json({ ok: true });
}
