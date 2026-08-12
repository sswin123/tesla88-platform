import { NextRequest } from 'next/server';
import { Client } from 'pg';
import { requirePermissionStrict } from '@/lib/require_permission';
import { resolveMonitorStreamFrame } from './_resolveFrame';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requirePermissionStrict('staff.livemonitor.view');
  if (!auth.ok) {
    return new Response(auth.status === 401 ? 'Unauthorized' : 'Forbidden', { status: auth.status });
  }
  const viewerRole = auth.payload.role;

  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    await client.query('LISTEN staff_monitor_updates');
  } catch {
    return new Response('DB connection failed', { status: 503 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const cleanup = async () => {
    if (closed) return;
    closed = true;
    try {
      await client.query('UNLISTEN staff_monitor_updates');
      await client.end();
    } catch {
      // ignore cleanup errors
    }
  };

  const stream = new ReadableStream({
    start(controller) {
      // Initial keepalive comment
      controller.enqueue(encoder.encode(': connected\n\n'));

      client.on('notification', (msg) => {
        if (!msg.payload || closed) return;
        resolveMonitorStreamFrame(msg.payload, viewerRole)
          .then((frame) => {
            if (!frame || closed) return;
            try {
              controller.enqueue(encoder.encode(frame));
            } catch {
              cleanup();
            }
          })
          .catch(() => {
            // Role lookup failed — best-effort suppression, never crash the stream.
          });
      });

      client.on('error', () => {
        cleanup();
        try { controller.close(); } catch { /* ignore */ }
      });

      // Heartbeat every 25s to keep connection alive through proxies
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
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
