import { NextRequest } from 'next/server';
import { Client } from 'pg';
import { requirePermission } from '@/lib/require_permission';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const payload = await requirePermission('deposit.view');
  if (!payload) return new Response('Unauthorized', { status: 401 });

  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    await client.query('LISTEN deposit_updates');
  } catch {
    return new Response('DB connection failed', { status: 503 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const cleanup = async () => {
    if (closed) return;
    closed = true;
    try {
      await client.query('UNLISTEN deposit_updates');
      await client.end();
    } catch { /* ignore */ }
  };

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(': connected\n\n'));

      client.on('notification', (msg) => {
        if (!msg.payload || closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${msg.payload}\n\n`));
        } catch {
          cleanup();
        }
      });

      client.on('error', () => {
        cleanup();
        try { controller.close(); } catch { /* ignore */ }
      });

      const hb = setInterval(() => {
        if (closed) { clearInterval(hb); return; }
        try { controller.enqueue(encoder.encode(': ping\n\n')); }
        catch { clearInterval(hb); cleanup(); }
      }, 25000);

      request.signal.addEventListener('abort', () => {
        clearInterval(hb);
        cleanup();
        try { controller.close(); } catch { /* ignore */ }
      });
    },
    cancel() { cleanup(); },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
