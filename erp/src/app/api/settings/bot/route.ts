import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getAllSettings, setSettings } from '@/lib/repositories/settings_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

const BOT_RELAY_URL        = process.env.BOT_RELAY_URL        ?? 'http://localhost:8090';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';
const BOT_TOKEN            = process.env.BOT_TOKEN            ?? '';

const BOT_SETTING_KEYS = new Set([
  'bot_name', 'bot_username', 'bot_description', 'bot_language', 'support_chat_id',
  'bot_relay_url', 'relay_timeout_secs', 'relay_retry_count', 'relay_retry_delay_secs',
  'notify_deposit', 'notify_withdrawal', 'notify_promotion', 'notify_bonus',
  'notify_announcement', 'notify_broadcast', 'notify_support', 'notify_maintenance',
]);

async function requireSuperAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload || payload.role !== 'SUPER_ADMIN') return null;
  return payload;
}

function maskToken(t: string): string {
  if (!t || t.length < 10) return '***';
  return `${t.slice(0, 4)}...${t.slice(-4)}`;
}

export async function GET() {
  const payload = await requireSuperAdmin();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const all = await getAllSettings();
  const settings: Record<string, string> = {};
  for (const s of all) {
    if (BOT_SETTING_KEYS.has(s.key)) settings[s.key] = s.value;
  }

  return NextResponse.json({
    settings,
    env: { bot_token_masked: maskToken(BOT_TOKEN), relay_url: BOT_RELAY_URL },
  });
}

export async function PATCH(request: NextRequest) {
  const payload = await requireSuperAdmin();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, string>;
  try {
    body = (await request.json()) as Record<string, string>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (BOT_SETTING_KEYS.has(k)) updates[k] = String(v);
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid bot setting keys provided' }, { status: 400 });
  }

  const allBefore = await getAllSettings();
  const oldValues = Object.fromEntries(allBefore.map((s) => [s.key, s.value]));

  await setSettings(updates, payload.username);

  logAudit({
    admin_id:    payload.sub,
    action:      'BOT_SETTINGS_UPDATED',
    target_type: 'system_settings',
    target_id:   null,
    new_value: {
      changes: Object.fromEntries(
        Object.entries(updates).map(([k, v]) => [k, { old: oldValues[k] ?? null, new: v }])
      ),
    },
  }).catch(() => {});

  let reloaded = false;
  try {
    const res = await fetch(`${BOT_RELAY_URL}/reload-settings`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${BOT_RELAY_AUTH_TOKEN}` },
      signal:  AbortSignal.timeout(5000),
    });
    reloaded = res.ok;
  } catch {
    reloaded = false;
  }

  return NextResponse.json({ ok: true, reloaded });
}
