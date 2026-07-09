import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { verifyMemberJWT, COOKIE_NAME } from '@/lib/auth';

const GUEST_COOKIE = 'guest_chat_id';

export const dynamic = 'force-dynamic';

async function checkSessionAccess(req: NextRequest, sessionId: string): Promise<boolean> {
  // Try member auth
  const token = req.cookies?.get(COOKIE_NAME)?.value;
  if (token) {
    try {
      const member = await verifyMemberJWT(token);
      const check = await pool.query(
        'SELECT id FROM support_sessions WHERE id = $1 AND user_id = $2',
        [sessionId, member.sub]
      );
      if (check.rows.length > 0) return true;
    } catch { /* fall through to guest check */ }
  }

  // Try guest auth
  const guestId = req.cookies?.get(GUEST_COOKIE)?.value;
  if (guestId) {
    const check = await pool.query(
      'SELECT id FROM support_sessions WHERE id = $1 AND guest_id = $2',
      [sessionId, guestId]
    );
    if (check.rows.length > 0) return true;
  }

  return false;
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!sessionId) return new Response('session_id required', { status: 400 });

  const allowed = await checkSessionAccess(req, sessionId);
  if (!allowed) return new Response('Unauthorized', { status: 401 });

  const encoder = new TextEncoder();
  let lastId = parseInt(req.nextUrl.searchParams.get('last_id') ?? '0');

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      send({ type: 'connected' });

      const interval = setInterval(async () => {
        try {
          const msgs = await pool.query(
            `SELECT id, sender_type, message_type, content, caption, created_at
             FROM support_messages WHERE session_id = $1 AND id > $2 ORDER BY id ASC`,
            [sessionId, lastId]
          );
          for (const m of msgs.rows) {
            send({ type: 'message', ...m });
            lastId = m.id as number;
          }
          const sess = await pool.query('SELECT status FROM support_sessions WHERE id = $1', [sessionId]);
          if (sess.rows[0]?.status === 'CLOSED') {
            send({ type: 'session_closed' });
            clearInterval(interval);
            controller.close();
          }
        } catch {
          clearInterval(interval);
          controller.close();
        }
      }, 3000);

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'Content-Encoding':  'identity',
      'X-Accel-Buffering': 'no',
    },
  });
}
