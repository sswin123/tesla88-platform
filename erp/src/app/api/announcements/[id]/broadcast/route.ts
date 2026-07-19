import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import {
  getAnnouncementById,
  getUsersForBroadcast,
  incrementSentCount,
} from '@/lib/repositories/announcement_repo';
import { logAudit } from '@/lib/repositories/audit_repo';
import { getSetting } from '@/lib/repositories/settings_repo';

const BOT_RELAY_URL = process.env.BOT_RELAY_URL ?? 'http://localhost:8090';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('announcements.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id, 10);

  const announcement = await getAnnouncementById(numId);
  if (!announcement) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const users = await getUsersForBroadcast(announcement.target, announcement.target_tag_id);
  const telegramIds = users.map(u => u.telegram_id);

  if (telegramIds.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No eligible users found' });
  }

  const notifyAnnouncement = await getSetting('notify_announcement').catch(() => null);
  if (notifyAnnouncement === 'false') {
    return NextResponse.json({ ok: true, sent: 0, message: 'Announcement notifications are disabled.' });
  }

  // The existing relay server only supports session-based messaging (/relay).
  // There is no /broadcast or /send_to_telegram_id endpoint on the bot relay.
  // Attempt to call /send_to_telegram_id for each user; fall back gracefully if unavailable.
  let sent = 0;
  const errors: string[] = [];
  let relayAvailable: boolean | null = null;

  for (const telegramId of telegramIds) {
    try {
      const res = await fetch(`${BOT_RELAY_URL}/send_to_telegram_id`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${BOT_RELAY_AUTH_TOKEN}`,
        },
        body: JSON.stringify({
          telegram_id: telegramId,
          message: announcement.content,
        }),
      });

      if (res.status === 404 && relayAvailable === null) {
        // Endpoint not implemented on relay server — exit early and return ids
        relayAvailable = false;
        break;
      }

      if (res.ok) {
        sent++;
        relayAvailable = true;
      } else {
        errors.push(`${telegramId}: HTTP ${res.status}`);
      }
    } catch (err) {
      // Network error — relay unreachable
      relayAvailable = false;
      errors.push(`${telegramId}: ${String(err)}`);
      break;
    }
  }

  if (relayAvailable === false) {
    // Relay does not support direct telegram_id broadcasts yet.
    // Return the telegram_ids so the operator can handle manually.
    return NextResponse.json({
      ok: true,
      sent: 0,
      telegram_ids: telegramIds,
      message:
        'Bot relay /send_to_telegram_id endpoint not available — manual send required. ' +
        'Add POST /send_to_telegram_id { telegram_id, message } to bot/api_server.py.',
    });
  }

  if (sent > 0) {
    await incrementSentCount(numId, sent);
  }

  logAudit({
    admin_id: payload.sub,
    action: 'ANNOUNCEMENT_BROADCAST',
    target_type: 'announcement',
    target_id: numId,
    new_value: { sent, target: announcement.target },
  }).catch(() => {});
  return NextResponse.json({
    ok: true,
    sent,
    total: telegramIds.length,
    ...(errors.length > 0 && { errors }),
  });
}
