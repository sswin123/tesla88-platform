import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';

const GUEST_COOKIE = 'guest_chat_id';

// Fires at most once per session, right after that session's first message is
// inserted. Uses an atomic conditional UPDATE as the "already sent" guard so
// concurrent requests can't both pass the check (no SELECT-then-INSERT race).
// Guard + settings check + insert run as one transaction so a mid-way failure
// can't leave the guard "spent" with no SYSTEM message actually sent. Never
// throws — a failure here must not turn the customer's own message send into
// an error response, since that message was already committed separately.
async function maybeSendAutoReply(sessionId: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const guard = await client.query(
      `UPDATE support_sessions SET auto_reply_sent_at = NOW()
       WHERE id = $1 AND auto_reply_sent_at IS NULL
       RETURNING id`,
      [sessionId]
    );
    if (guard.rows.length === 0) {
      await client.query('ROLLBACK'); // not this session's first message
      return;
    }

    const settings = await client.query<{ key: string; value: string }>(
      `SELECT key, value FROM system_settings WHERE key IN ('auto_reply_enabled', 'auto_reply_message')`
    );
    const enabled = settings.rows.find(r => r.key === 'auto_reply_enabled')?.value === 'true';
    const message = settings.rows.find(r => r.key === 'auto_reply_message')?.value?.trim();
    if (!enabled || !message) {
      await client.query('COMMIT'); // guard stays consumed — this was genuinely the first message
      return;
    }

    await client.query(
      `INSERT INTO support_messages (session_id, sender_type, message_type, content)
       VALUES ($1, 'SYSTEM', 'TEXT', $2)`,
      [sessionId, message]
    );
    await client.query('UPDATE support_sessions SET last_message_at = NOW() WHERE id = $1', [sessionId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[livechat] auto-reply failed:', err);
  } finally {
    client.release();
  }
}

export async function GET(req: NextRequest) {
  const member = await getMember();
  const guestId = req.cookies?.get(GUEST_COOKIE)?.value;
  if (!member && !guestId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sessionId = new URL(req.url).searchParams.get('session_id');
  if (!sessionId) return NextResponse.json({ error: 'session_id required' }, { status: 400 });

  // Verify session ownership
  if (member) {
    const check = await pool.query(
      'SELECT id FROM support_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, member.sub]
    );
    if (check.rows.length === 0) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  } else {
    const check = await pool.query(
      'SELECT id FROM support_sessions WHERE id = $1 AND guest_id = $2',
      [sessionId, guestId]
    );
    if (check.rows.length === 0) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const msgs = await pool.query(
    `SELECT id, sender_type, message_type, content, caption, created_at,
            reply_to_message_id, reply_to_content, reply_to_sender_type
     FROM support_messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT 200`,
    [sessionId]
  );
  return NextResponse.json(msgs.rows);
}

export async function POST(req: NextRequest) {
  const member = await getMember();
  const guestId = req.cookies?.get(GUEST_COOKIE)?.value;
  if (!member && !guestId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { session_id?: number; content?: string; message_type?: string; caption?: string };
  if (!body.session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  if (!body.content)    return NextResponse.json({ error: 'content required' }, { status: 400 });
  const msgType = (['PHOTO', 'VIDEO', 'DOCUMENT', 'AUDIO'].includes(body.message_type ?? '') ? body.message_type : 'TEXT') as string;

  // Verify session ownership and open/active status
  let allowed = false;
  if (member) {
    const check = await pool.query(
      `SELECT id FROM support_sessions WHERE id = $1 AND user_id = $2 AND status IN ('OPEN','ACTIVE')`,
      [body.session_id, member.sub]
    );
    allowed = check.rows.length > 0;
  } else {
    const check = await pool.query(
      `SELECT id FROM support_sessions WHERE id = $1 AND guest_id = $2 AND status IN ('OPEN','ACTIVE')`,
      [body.session_id, guestId]
    );
    allowed = check.rows.length > 0;
  }
  if (!allowed) return NextResponse.json({ error: 'Session not found or closed' }, { status: 404 });

  // Check if customer is muted
  const muteCheck = await pool.query<{ muted_until: string | null }>(
    `SELECT muted_until FROM support_sessions WHERE id = $1`,
    [body.session_id]
  );
  const mutedUntil = muteCheck.rows[0]?.muted_until;
  if (mutedUntil && new Date(mutedUntil) > new Date()) {
    return NextResponse.json({ error: 'muted', muted_until: mutedUntil }, { status: 403 });
  }

  const msg = await pool.query(
    `INSERT INTO support_messages (session_id, sender_type, message_type, content, caption)
     VALUES ($1, 'USER', $2, $3, $4) RETURNING id, created_at`,
    [body.session_id, msgType, body.content, body.caption ?? null]
  );
  await pool.query('UPDATE support_sessions SET last_message_at = NOW() WHERE id = $1', [body.session_id]);
  await maybeSendAutoReply(body.session_id);
  return NextResponse.json({ ok: true, id: msg.rows[0].id as number, created_at: msg.rows[0].created_at as string }, { status: 201 });
}
