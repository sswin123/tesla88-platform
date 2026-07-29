/**
 * MEGA888 App login callback bridge.
 *
 * Primary path: MEGA888 calls https://apidemo.club/api/games/megaapp/callback/login
 * which nginx routes directly to ERP (same as 918KISS pattern).
 *
 * Fallback path: if MEGA888 calls https://apidemo.club/api/mega/callback,
 * this route proxies to the ERP callback handler.
 */
import { NextRequest, NextResponse } from 'next/server';

const ERP_CALLBACK_URL =
  (process.env.ERP_INTERNAL_URL ?? 'http://erp:3000').replace(/\/$/, '') +
  '/api/games/megaapp/callback/login';

/** GET — liveness probe so ops can verify the route is reachable. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, ts: new Date().toISOString(), route: '/api/mega/callback' });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for') ?? 'unknown';

  let body: string;
  try {
    body = await req.text();
  } catch {
    console.error('[mega-callback-proxy] failed to read request body from', ip);
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, result: null, error: { code: 700, message: 'Invalid request body' } },
      { status: 400 },
    );
  }

  console.log(`[mega-callback-proxy] POST from=${ip} body=${body.slice(0, 200)}`);

  let res: Response;
  try {
    res = await fetch(ERP_CALLBACK_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal:  AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error('[mega-callback-proxy] ERP unreachable:', err);
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, result: { success: '0', errorCode: '21118', msg: 'Service unavailable' }, error: null },
      { status: 503 },
    );
  }

  const data = await res.json();
  console.log(`[mega-callback-proxy] ERP responded status=${res.status} data=${JSON.stringify(data).slice(0, 200)}`);
  return NextResponse.json(data, { status: res.status });
}
