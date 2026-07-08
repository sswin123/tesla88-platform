import { NextResponse } from 'next/server';
import { setSettings } from '@/lib/repositories/settings_repo';
import { getMe } from '@/lib/telegram/bot_api';
import { requirePermission } from '@/lib/require_permission';

export async function POST() {
  const payload = await requirePermission('bot.settings');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const botToken = process.env.BOT_TOKEN ?? '';
  if (!botToken) {
    return NextResponse.json({ error: 'BOT_TOKEN not configured' }, { status: 503 });
  }

  try {
    const meRes = await getMe(botToken);
    if (!meRes.ok || !meRes.result) {
      return NextResponse.json(
        { error: meRes.description ?? 'Telegram getMe failed' },
        { status: 502 },
      );
    }

    const me = meRes.result;
    await setSettings(
      {
        bot_id:         String(me.id),
        bot_username:   me.username ?? '',
        bot_name:       me.first_name,
        last_synced_at: new Date().toISOString(),
      },
      'system',
    );

    return NextResponse.json({
      ok: true,
      bot_id:       me.id,
      bot_username: me.username ?? '',
      bot_name:     me.first_name,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 502 },
    );
  }
}
