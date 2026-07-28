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

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { action } = await params;

  console.log(`[megah5-callback] action=${action} method=${request.method}`);

  // Parse body
  let rawBody: Record<string, unknown>;
  try {
    rawBody = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: OPERATOR_ERROR.SYSTEM_ERROR });
  }

  // Find active brand for MEGAH5
  const { rows: bpRows } = await pool.query<{ brand_code: string }>(
    `SELECT b.code AS brand_code
     FROM brand_providers bp
     JOIN brands b       ON b.id = bp.brand_id
     JOIN gp_providers p ON p.id = bp.provider_id
     WHERE p.code = 'MEGAH5' AND bp.status = 'ACTIVE'
     LIMIT 1`,
  );

  if (!bpRows[0]) {
    return NextResponse.json({ error: OPERATOR_ERROR.MAINTENANCE });
  }

  // Get adapter from BrandProviderManager
  let adapter: MegaH5Adapter;
  try {
    const platform = createGamingPlatform();
    adapter = await platform.brandManager.getAdapter(bpRows[0].brand_code, 'MEGAH5') as MegaH5Adapter;
  } catch {
    return NextResponse.json({ error: OPERATOR_ERROR.MAINTENANCE });
  }

  // Resolve handler
  const handler = resolveHandler(adapter, action);
  if (!handler) {
    console.warn(`[megah5-callback] unknown action "${action}"`);
    return NextResponse.json({ error: OPERATOR_ERROR.SYSTEM_ERROR });
  }

  // Build headers map
  const headers: Record<string, string | undefined> = {};
  request.headers.forEach((v, k) => { headers[k] = v; });

  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null;

  try {
    const result = await handler(rawBody, headers, ip);
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[megah5-callback] handler threw for action="${action}":`, err);
    return NextResponse.json({ error: OPERATOR_ERROR.SYSTEM_ERROR });
  }
}
