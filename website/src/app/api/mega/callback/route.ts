/**
 * MEGA888 App login callback bridge.
 *
 * MEGA888 is configured to call https://apidemo.club/api/mega/callback
 * (the public website URL). This route proxies the request to the ERP
 * callback handler which contains the adapter logic.
 *
 * ERP endpoint: POST /api/games/megaapp/callback/login
 */
import { NextRequest, NextResponse } from 'next/server';

const ERP_CALLBACK_URL =
  (process.env.ERP_INTERNAL_URL ?? 'http://erp:3000').replace(/\/$/, '') +
  '/api/games/megaapp/callback/login';

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: string;
  try {
    body = await req.text();
  } catch {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, result: null, error: { code: 700, message: 'Invalid request body' } },
      { status: 400 },
    );
  }

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
  return NextResponse.json(data, { status: res.status });
}
