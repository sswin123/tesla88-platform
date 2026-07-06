import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { verifyMemberJWT, COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return new Response('Unauthorized', { status: 401 });

  let member;
  try { member = await verifyMemberJWT(token); }
  catch { return new Response('Unauthorized', { status: 401 }); }

  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!sessionId) return new Response('session_id required', { status: 400 });

  const check = await pool.query(
    'SELECT id FROM support_sessions WHERE id = $1 AND user_id = $2',
    [sessionId, member.sub]
  );
  if (check.rows.length === 0) return new Response('Forbidden', { status: 403 });

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
          // Also check session status
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
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  });
}
