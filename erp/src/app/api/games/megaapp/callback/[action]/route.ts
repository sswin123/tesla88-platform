// erp/src/app/api/games/megaapp/callback/[action]/route.ts
//
// MEGA calls this endpoint when a player logs into the MEGA888 native app.
// Method: open.operator.user.login
// URL configured in MEGA admin: https://yoursite.com/api/games/megaapp/callback/login
//
// The body is a JSON-RPC 2.0 envelope:
// {
//   "jsonrpc": "2.0",
//   "method":  "open.operator.user.login",
//   "id":      "...",
//   "params":  { "random", "digest", "sn", "loginId", "password" }
// }
import { NextRequest, NextResponse } from 'next/server';
import { createGamingPlatform } from '@/lib/providers';
import type { MegaAppAdapter } from '@/lib/providers/adapters/megaapp/MegaAppAdapter';
import pool from '@/lib/db';

type Params = { params: Promise<{ action: string }> };

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { action } = await params;
  const ct = request.headers.get('content-type') ?? '(none)';

  console.log(`[megaapp-callback] POST action="${action}" content-type="${ct}"`);

  // Only the login callback is supported
  if (action.toLowerCase() !== 'login') {
    console.warn(`[megaapp-callback] unknown action="${action}"`);
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, result: null, error: { code: '700', message: 'Unknown action' } },
    );
  }

  // Read raw body first so we can log it before parsing
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err) {
    console.error('[megaapp-callback] failed to read body:', err);
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, result: null, error: { code: '700', message: 'Cannot read body' } },
    );
  }
  console.log(`[megaapp-callback] body len=${rawBody.length} preview="${rawBody.slice(0, 300)}"`);

  // Parse JSON-RPC envelope
  let envelope: { jsonrpc?: string; id?: string; method?: string; params?: Record<string, unknown> };
  try {
    envelope = JSON.parse(rawBody) as typeof envelope;
  } catch (err) {
    console.error('[megaapp-callback] JSON parse failed:', err, '| raw=', rawBody.slice(0, 200));
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, result: null, error: { code: '700', message: 'Invalid JSON' } },
    );
  }

  const rpcId     = envelope.id   ?? '';
  const rpcParams = envelope.params ?? {};

  console.log(`[megaapp-callback] login rpcId=${rpcId} loginId=${rpcParams['loginId']}`);

  // Find active brand that has MEGAAPP enabled
  const { rows: bpRows } = await pool.query<{ brand_code: string }>(
    `SELECT b.code AS brand_code
     FROM brand_providers bp
     JOIN brands b       ON b.id = bp.brand_id
     JOIN gp_providers p ON p.id = bp.provider_id
     WHERE p.code = 'MEGAAPP' AND bp.status = 'ACTIVE'
     LIMIT 1`,
  );

  if (!bpRows[0]) {
    console.warn('[megaapp-callback] no active MEGAAPP brand found');
    return NextResponse.json({
      jsonrpc: '2.0', id: rpcId, result: null,
      error: { code: '21118', message: '系统正在维护中，请联系客服' },
    });
  }

  // Get adapter
  let adapter: MegaAppAdapter;
  try {
    const platform = createGamingPlatform();
    adapter = await platform.brandManager.getAdapter(bpRows[0].brand_code, 'MEGAAPP') as MegaAppAdapter;
  } catch (err) {
    console.error('[megaapp-callback] failed to load adapter:', err);
    return NextResponse.json({
      jsonrpc: '2.0', id: rpcId, result: null,
      error: { code: '21118', message: '系统维护中' },
    });
  }

  // Delegate to adapter
  try {
    const result = await adapter.handleLoginCallback(rpcId, rpcParams);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[megaapp-callback] handleLoginCallback threw:', err);
    return NextResponse.json({
      jsonrpc: '2.0', id: rpcId, result: null,
      error: { code: '37101', message: 'API调用异常' },
    });
  }
}
