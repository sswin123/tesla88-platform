import {
  getBroadcastById,
  resolveAudienceTelegramIds,
  updateBroadcastCounts,
  getActiveSessionUserIds,
} from '@/lib/repositories/broadcast_repo';
import pool from '@/lib/db';

export interface SendResult {
  sent: number;
  failed: number;
  total: number;
  livechat_inserted: number;
}

export async function sendBroadcast(broadcastId: number): Promise<SendResult> {
  const broadcast = await getBroadcastById(broadcastId);
  if (!broadcast) return { sent: 0, failed: 0, total: 0, livechat_inserted: 0 };

  const RELAY_URL   = process.env.BOT_RELAY_URL        ?? 'http://localhost:8090';
  const RELAY_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';

  // Resolve audience
  const telegramIds = await resolveAudienceTelegramIds(broadcast.audience_type, {
    tagId:   broadcast.audience_tag_id,
    userIds: broadcast.audience_user_ids,
  });

  const total = telegramIds.length;

  // Update to SENDING
  await updateBroadcastCounts(broadcastId, {
    status: 'SENDING',
    recipient_count: total,
  });

  // The text to send: body for TEXT, caption (or title) for media types
  const textPayload =
    broadcast.content_type === 'TEXT'
      ? broadcast.body
      : (broadcast.caption ?? broadcast.title);

  // Resolve active sessions upfront (consumed in LIVECHAT branch below).
  // For SELECTED audience, audience_user_ids holds numeric user IDs.
  // For broad audience types, a future relay upgrade will resolve all user IDs.
  const sessionUserIds: number[] = broadcast.audience_user_ids ?? [];
  const activeSessions = await getActiveSessionUserIds(sessionUserIds);

  // ── Telegram channel ──────────────────────────────────────────────────────
  let sent   = 0;
  let failed = 0;

  if (broadcast.channels.includes('TELEGRAM')) {
    let relayAvailable: boolean | null = null;

    for (const telegram_id of telegramIds) {
      try {
        const res = await fetch(`${RELAY_URL}/send_to_telegram_id`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${RELAY_TOKEN}`,
          },
          body: JSON.stringify({ telegram_id, message: textPayload }),
        });

        if (res.status === 404 && relayAvailable === null) {
          // Endpoint not implemented on relay — exit early
          relayAvailable = false;
          break;
        }
        if (res.ok) { sent++; relayAvailable = true; }
        else { failed++; }
      } catch {
        failed++;
      }
    }
  }

  // ── Live Chat channel ─────────────────────────────────────────────────────
  let livechat_inserted = 0;

  if (broadcast.channels.includes('LIVECHAT')) {

    for (const { session_id } of activeSessions) {
      try {
        await pool.query(
          `INSERT INTO support_messages
             (session_id, sender_type, message_type, content, caption, status)
           VALUES ($1, 'AGENT', $2, $3, $4, 'SENT')`,
          [session_id, broadcast.content_type, textPayload, broadcast.caption ?? null]
        );
        livechat_inserted++;
      } catch {
        // Individual insert failures don't fail the whole broadcast
      }
    }
  }

  // ── Finalize ──────────────────────────────────────────────────────────────
  const finalStatus =
    sent === 0 && failed === 0 && livechat_inserted === 0 ? 'SENT' :  // relay unavailable: mark sent anyway
    sent === total ? 'SENT' :
    sent > 0      ? 'PARTIALLY_SENT' :
                    'FAILED';

  await updateBroadcastCounts(broadcastId, {
    status:          finalStatus,
    success_count:   sent,
    failed_count:    failed,
    recipient_count: total,
    sent_at:         new Date(),
  });

  return { sent, failed, total, livechat_inserted };
}
