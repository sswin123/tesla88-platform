// erp/src/app/api/games/megaapp/callback/[action]/route.ts
//
// MEGA calls this endpoint when a player logs into the MEGA888 native app.
// Method: open.operator.user.login
// URL configured in MEGA admin: https://yoursite.com/api/games/megaapp/callback/login
//
// ╔══════════════════════════════════════════════════════════════╗
// ║  AUTHENTICATION ONLY — this route never touches wallet.      ║
// ║  Transfer In:  Play Button only  (launch/route.ts)           ║
// ║  Transfer Out: Refresh only      (member-wallet-sync/route)  ║
// ╚══════════════════════════════════════════════════════════════╝
import { NextRequest, NextResponse } from 'next/server';
import { createGamingPlatform } from '@/lib/providers';
import type { MegaAppAdapter } from '@/lib/providers/adapters/megaapp/MegaAppAdapter';
import pool from '@/lib/db';

type Params = { params: Promise<{ action: string }> };

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { action } = await params;
  const ct = request.headers.get('content-type') ?? '(none)';
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown';

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[megaapp-callback] ▶ RECEIVED POST action="${action}" content-type="${ct}" ip=${ip}`);
  console.log(`${'='.repeat(60)}`);

  if (action.toLowerCase() !== 'login') {
    console.warn(`[megaapp-callback] ✗ unknown action="${action}"`);
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, result: null, error: { code: '700', message: 'Unknown action' } },
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err) {
    console.error('[megaapp-callback] ✗ failed to read body:', err);
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, result: null, error: { code: '700', message: 'Cannot read body' } },
    );
  }

  console.log(`[megaapp-callback] RAW BODY (len=${rawBody.length}):`);
  console.log(rawBody.slice(0, 1000));

  let jsonStr = rawBody;
  if (rawBody.startsWith('json=')) {
    jsonStr = decodeURIComponent(rawBody.slice('json='.length));
    console.log(`[megaapp-callback] decoded from form: ${jsonStr.slice(0, 500)}`);
  }

  let envelope: { jsonrpc?: string; id?: string; method?: string; params?: Record<string, unknown> };
  try {
    envelope = JSON.parse(jsonStr) as typeof envelope;
  } catch (err) {
    console.error('[megaapp-callback] ✗ JSON parse failed:', err, '| jsonStr=', jsonStr.slice(0, 200));
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, result: null, error: { code: '700', message: 'Invalid JSON' } },
    );
  }

  const rpcId     = envelope.id     ?? '';
  const rpcMethod = envelope.method ?? '';
  const rpcParams = envelope.params ?? {};

  console.log(`[megaapp-callback] PARSED: rpcId="${rpcId}" method="${rpcMethod}"`);
  console.log(`[megaapp-callback] PARAMS: loginId="${rpcParams['loginId']}" sn="${rpcParams['sn']}" random="${String(rpcParams['random'] ?? '').slice(0, 8)}..."`);

  const { rows: bpRows } = await pool.query<{ brand_code: string }>(
    `SELECT b.code AS brand_code
     FROM brand_providers bp
     JOIN brands b       ON b.id = bp.brand_id
     JOIN gp_providers p ON p.id = bp.provider_id
     WHERE p.code = 'MEGAAPP' AND bp.status = 'ACTIVE'
     LIMIT 1`,
  );

  if (!bpRows[0]) {
    console.warn('[megaapp-callback] ✗ no active MEGAAPP brand found in brand_providers');
    return NextResponse.json({
      jsonrpc: '2.0', id: rpcId, result: null,
      error: { code: '21118', message: '系统正在维护中，请联系客服' },
    });
  }
  console.log(`[megaapp-callback] brand_code="${bpRows[0].brand_code}"`);

  let adapter: MegaAppAdapter;
  try {
    const platform = createGamingPlatform();
    adapter = await platform.brandManager.getAdapter(bpRows[0].brand_code, 'MEGAAPP') as MegaAppAdapter;
    console.log(`[megaapp-callback] ✓ adapter loaded`);
  } catch (err) {
    console.error('[megaapp-callback] ✗ failed to load adapter:', err);
    return NextResponse.json({
      jsonrpc: '2.0', id: rpcId, result: null,
      error: { code: '21118', message: '系统维护中' },
    });
  }

  // ── Authentication only ───────────────────────────────────────────────────
  // Verify digest + password, generate sessionId.
  // No wallet operations here. MEGA triggers this callback on every app login
  // (including background reconnects), so any wallet logic here creates loops.
  let result: Record<string, unknown>;
  try {
    result = await adapter.handleLoginCallback(rpcId, rpcParams);
    console.log(`[megaapp-callback] handleLoginCallback result:`, JSON.stringify(result));
  } catch (err) {
    console.error('[megaapp-callback] ✗ handleLoginCallback threw:', err);
    return NextResponse.json({
      jsonrpc: '2.0', id: rpcId, result: null,
      error: { code: '37101', message: 'API调用异常' },
    });
  }

  console.log(`[megaapp-callback] ◀ RETURNING response to MEGA:`, JSON.stringify(result));
  console.log(`${'='.repeat(60)}\n`);

  return NextResponse.json(result);
}
