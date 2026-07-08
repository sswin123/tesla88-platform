import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getAllSettings, setSettings } from '@/lib/repositories/settings_repo';
import { logAudit } from '@/lib/repositories/audit_repo';
import {
  getMe,
  setMyName,
  setMyDescription,
  setMyShortDescription,
} from '@/lib/telegram/bot_api';

const BOT_RELAY_URL        = process.env.BOT_RELAY_URL        ?? 'http://localhost:8090';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';

// Keys readable via GET
const BOT_SETTING_KEYS = new Set([
  'bot_name', 'bot_username', 'bot_description', 'bot_short_description',
  'bot_language', 'support_chat_id',
  'bot_relay_url', 'relay_timeout_secs', 'relay_retry_count', 'relay_retry_delay_secs',
  'notify_deposit', 'notify_withdrawal', 'notify_promotion', 'notify_bonus',
  'notify_announcement', 'notify_broadcast', 'notify_support', 'notify_maintenance',
  'bot_id', 'last_synced_at', 'bot_avatar_media_id',
]);

// Keys that the user can write via PATCH (excludes system-managed + read-only)
const USER_WRITABLE_KEYS = new Set([
  'bot_name', 'bot_description', 'bot_short_description',
  'bot_language', 'support_chat_id',
  'bot_relay_url', 'relay_timeout_secs', 'relay_retry_count', 'relay_retry_delay_secs',
  'notify_deposit', 'notify_withdrawal', 'notify_promotion', 'notify_bonus',
  'notify_announcement', 'notify_broadcast', 'notify_support', 'notify_maintenance',
  'bot_avatar_media_id',
]);

// Keys that map to Telegram profile API calls
const TG_PROFILE_KEYS = new Set(['bot_name', 'bot_description', 'bot_short_description']);

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

  const botToken = process.env.BOT_TOKEN ?? '';
  return NextResponse.json({
    settings,
    env: { bot_token_masked: maskToken(botToken), relay_url: BOT_RELAY_URL },
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

  // Only allow user-writable keys (bot_username is intentionally excluded)
  const updates: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (USER_WRITABLE_KEYS.has(k)) updates[k] = String(v);
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid bot setting keys provided' }, { status: 400 });
  }

  const allBefore = await getAllSettings();
  const oldValues = Object.fromEntries(allBefore.map((s) => [s.key, s.value]));

  // Step 1: Save to database
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

  // Step 2: Sync Telegram profile if any profile keys changed
  let telegramSynced = false;
  let telegramError: string | undefined;

  const profileChanged = Object.keys(updates).some((k) => TG_PROFILE_KEYS.has(k));
  if (profileChanged) {
    const botToken = process.env.BOT_TOKEN ?? '';
    if (botToken) {
      try {
        const calls: Promise<unknown>[] = [];
        if ('bot_name' in updates) {
          calls.push(setMyName(botToken, updates['bot_name']));
        }
        if ('bot_description' in updates) {
          calls.push(setMyDescription(botToken, updates['bot_description']));
        }
        if ('bot_short_description' in updates) {
          calls.push(setMyShortDescription(botToken, updates['bot_short_description']));
        }
        const results = await Promise.all(calls) as Array<{ ok: boolean; description?: string }>;
        const failed = results.find((r) => !r.ok);
        if (failed) {
          telegramError = failed.description ?? 'Telegram API error';
        } else {
          telegramSynced = true;
        }

        // Step 3: Verify — call getMe() and update database
        const meRes = await getMe(botToken);
        if (meRes.ok && meRes.result) {
          const me = meRes.result;
          await setSettings(
            {
              bot_id:          String(me.id),
              bot_username:    me.username ?? '',
              bot_name:        me.first_name,
              last_synced_at:  new Date().toISOString(),
            },
            'system',
          );
          telegramSynced = !failed;
        }
      } catch (err) {
        telegramError = err instanceof Error ? err.message : 'Telegram sync failed';
      }
    }
  }

  // Reload bot relay settings
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

  return NextResponse.json({ ok: true, reloaded, telegram_synced: telegramSynced, telegram_error: telegramError });
}
