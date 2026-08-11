import { NextRequest } from 'next/server';
import { Client } from 'pg';
import { requirePermissionStrict } from '@/lib/require_permission';
import { getStaffRole } from '@/lib/repositories/staff_monitor_repo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * SUPER_ADMIN visibility for the SSE stream (Live Monitor). The NOTIFY
 * payload (migration 083's trigger) carries staff_id but not role, and
 * extending that trigger is out of scope here, so the target's role is
 * looked up per event — a single indexed primary-key read, negligible at
 * Live Monitor's update frequency. A SUPER_ADMIN viewer never needs this
 * lookup at all (short-circuited), matching getMonitorSnapshot()'s same
 * "$viewer = 'SUPER_ADMIN' bypasses the check entirely" shape.
 *
 * Exported standalone so the filtering decision itself is directly
 * unit-testable without needing to drive the raw ReadableStream/Client
 * plumbing below.
 */
export async function resolveMonitorStreamFrame(rawPayload: string, viewerRole: string): Promise<string | null> {
  if (viewerRole === 'SUPER_ADMIN') return `data: ${rawPayload}\n\n`;

  let staffId: number | undefined;
  try {
    staffId = (JSON.parse(rawPayload) as { staff_id?: number }).staff_id;
  } catch {
    // Malformed payload — not attacker-reachable (NOTIFY is only ever
    // produced by our own trigger), so forward it rather than silently
    // dropping what would otherwise be a legitimate event.
    return `data: ${rawPayload}\n\n`;
  }
  if (typeof staffId !== 'number') return `data: ${rawPayload}\n\n`;

  const targetRole = await getStaffRole(staffId);
  if (targetRole === 'SUPER_ADMIN') return null;
  return `data: ${rawPayload}\n\n`;
}

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
