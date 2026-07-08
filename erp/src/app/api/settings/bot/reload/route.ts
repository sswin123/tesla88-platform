import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';

const BOT_RELAY_URL        = process.env.BOT_RELAY_URL        ?? 'http://localhost:8090';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';

export async function POST() {
  const payload = await requirePermission('bot.settings');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const res = await fetch(`${BOT_RELAY_URL}/reload-settings`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${BOT_RELAY_AUTH_TOKEN}` },
      signal:  AbortSignal.timeout(5000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: res.ok, ...(data as object) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 502 });
  }
}
