import { NextRequest, NextResponse } from 'next/server';
import { createGamingPlatform } from '@/lib/providers';
import { OPERATOR_ERROR } from '@/lib/providers/adapters/megah5/constants';
import pool from '@/lib/db';
import type { MegaH5Adapter } from '@/lib/providers/adapters/megah5/MegaH5Adapter';

type Params = { params: Promise<{ action: string }> };

type Handler = (
  rawBody: Record<string, unknown>,
  headers: Record<string, string | undefined>,
  ip:      string | null,
) => Promise<Record<string, unknown>>;

function resolveHandler(adapter: MegaH5Adapter, action: string): Handler | null {
  switch (action.toLowerCase()) {
    case 'authenticate':  return adapter.handleAuthenticateCallback.bind(adapter);
    case 'getbalance':    return adapter.handleGetBalanceCallback.bind(adapter);
    case 'bet':           return adapter.handleBetCallback.bind(adapter);
    case 'betresult':     return adapter.handleBetResultCallback.bind(adapter);
    case 'refund':        return adapter.handleRefundCallback.bind(adapter);
    case 'jackpotwin':    return adapter.handleJackpotWinCallback.bind(adapter);
    case 'fundrequest':   return adapter.handleFundRequestCallback.bind(adapter);
    case 'fundreturn':    return adapter.handleFundReturnCallback.bind(adapter);
    case 'fundbetresult': return adapter.handleFundBetResultCallback.bind(adapter);
    default: return null;
  }
}

async function dispatch(
  request: NextRequest,
  { params }: Params,
  rawBody: Record<string, unknown>,
): Promise<NextResponse> {
  const t0 = Date.now();
  const { action } = await params;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? null;

  console.log(`[megah5-callback] ▶ action=${action} method=${request.method} ip=${ip}`);

  // Find active brand for MEGAH5 (ACTIVE or TESTING — both valid during UAT)
  const { rows: bpRows } = await pool.query<{ brand_code: string; bp_status: string }>(
    `SELECT b.code AS brand_code, bp.status AS bp_status
     FROM brand_providers bp
     JOIN brands b       ON b.id = bp.brand_id
     JOIN gp_providers p ON p.id = bp.provider_id
     WHERE UPPER(p.code) = 'MEGAH5'
       AND bp.status IN ('ACTIVE', 'TESTING')
     ORDER BY (bp.status = 'ACTIVE') DESC, bp.id ASC
     LIMIT 1`,
  );

  if (!bpRows[0]) {
    console.error('[megah5-callback] no ACTIVE/TESTING brand found for MEGAH5');
    return NextResponse.json({ error: OPERATOR_ERROR.MAINTENANCE });
  }

  console.log(`[megah5-callback] brand=${bpRows[0].brand_code} status=${bpRows[0].bp_status}`);

  // Get adapter from BrandProviderManager
  let adapter: MegaH5Adapter;
  try {
    const platform = createGamingPlatform();
    adapter = await platform.brandManager.getAdapter(bpRows[0].brand_code, 'MEGAH5') as MegaH5Adapter;
  } catch (err) {
    console.error('[megah5-callback] adapter load failed:', err);
    return NextResponse.json({ error: OPERATOR_ERROR.MAINTENANCE });
  }

  // Resolve handler
  const handler = resolveHandler(adapter, action);
  if (!handler) {
    console.warn(`[megah5-callback] unknown action "${action}"`);
    return NextResponse.json({ error: OPERATOR_ERROR.UNKNOWN });
  }

  // Build headers map
  const headers: Record<string, string | undefined> = {};
  request.headers.forEach((v, k) => { headers[k] = v; });

  try {
    const result = await handler(rawBody, headers, ip);
    console.log(`[megah5-callback] ◀ action=${action} elapsed=${Date.now() - t0}ms`);
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[megah5-callback] handler threw for action="${action}":`, err);
    return NextResponse.json({ error: OPERATOR_ERROR.SYSTEM_ERROR });
  }
}

// MEGA sends POST for write callbacks (Authenticate, Bet, BetResult, Refund, …)
export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  let rawBody: Record<string, unknown>;
  let rawText = '';
  try {
    rawText = await request.text();
    rawBody = rawText ? JSON.parse(rawText) as Record<string, unknown> : {};
  } catch {
    console.error(`[megah5-callback] body parse failed: ${rawText.slice(0, 200)}`);
    return NextResponse.json({ error: OPERATOR_ERROR.SYSTEM_ERROR });
  }
  return dispatch(request, { params }, rawBody);
}

// MEGA sends GET for read callbacks (GetBalance) with params in query string.
// Without this export, Next.js returns 405 and the handler never runs.
export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const rawBody: Record<string, unknown> = {};
  request.nextUrl.searchParams.forEach((v, k) => { rawBody[k] = v; });
  return dispatch(request, { params }, rawBody);
}
