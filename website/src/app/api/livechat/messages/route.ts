import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';

const GUEST_COOKIE = 'guest_chat_id';

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

  const msg = await pool.query(
    `INSERT INTO support_messages (session_id, sender_type, message_type, content, caption)
     VALUES ($1, 'USER', $2, $3, $4) RETURNING id, created_at`,
    [body.session_id, msgType, body.content, body.caption ?? null]
  );
  await pool.query('UPDATE support_sessions SET last_message_at = NOW() WHERE id = $1', [body.session_id]);
  return NextResponse.json({ ok: true, id: msg.rows[0].id as number, created_at: msg.rows[0].created_at as string }, { status: 201 });
}
