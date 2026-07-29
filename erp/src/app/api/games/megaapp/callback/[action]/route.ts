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

  // MEGA888 sends the payload as URL-encoded form data: json={...}
  // Fall back to treating body as raw JSON if no json= prefix is found.
  let jsonStr = rawBody;
  if (rawBody.startsWith('json=')) {
    jsonStr = decodeURIComponent(rawBody.slice('json='.length));
  }

  // Parse JSON-RPC envelope
  let envelope: { jsonrpc?: string; id?: string; method?: string; params?: Record<string, unknown> };
  try {
    envelope = JSON.parse(jsonStr) as typeof envelope;
  } catch (err) {
    console.error('[megaapp-callback] JSON parse failed:', err, '| jsonStr=', jsonStr.slice(0, 200));
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
  let result: Record<string, unknown>;
  try {
    result = await adapter.handleLoginCallback(rpcId, rpcParams);
  } catch (err) {
    console.error('[megaapp-callback] handleLoginCallback threw:', err);
    return NextResponse.json({
      jsonrpc: '2.0', id: rpcId, result: null,
      error: { code: '37101', message: 'API调用异常' },
    });
  }

  // If login succeeded, sync wallets:
  // 1. autoWithdrawAll — pull any remaining MEGA balance back to main wallet
  // 2. topUp — push the current main wallet balance into MEGA
  // This runs on every app login so balances stay consistent even when the
  // player exits and re-enters without going through the website launch route.
  if (!result['error']) {
    const loginId = String(rpcParams['loginId'] ?? '');
    try {
      // Find the platform user by loginId
      const { rows: paRows } = await pool.query<{ user_id: number }>(
        `SELECT user_id FROM provider_accounts
         WHERE provider_code = 'MEGAAPP' AND provider_login_id = $1 LIMIT 1`,
        [loginId],
      );
      const userId = paRows[0]?.user_id;

      if (userId) {
        // Step 1: pull any leftover MEGA balance back to main wallet
        try {
          const returned = await adapter.autoWithdrawAll(loginId);
          if (returned > 0) {
            await pool.query(
              `UPDATE users SET total_deposit = total_deposit + $1 WHERE id = $2`,
              [returned, userId],
            );
            console.log(`[megaapp-callback] autoWithdraw ok: userId=${userId} returned=${returned} loginId=${loginId}`);
          }
        } catch (err) {
          console.warn('[megaapp-callback] autoWithdraw failed (non-fatal):', (err instanceof Error ? err.message : String(err)));
        }

        // Step 2: read fresh main wallet balance and push to MEGA
        const { rows: balRows } = await pool.query<{ available_balance: string }>(
          `SELECT available_balance FROM users WHERE id = $1 LIMIT 1`,
          [userId],
        );
        const balance = parseFloat(balRows[0]?.available_balance ?? '0');

        if (balance > 0) {
          const refId = `MEGAUP-${userId}-${Date.now()}`;
          // Retry up to 3 times: MEGA may hold a distributed lock (error 37153)
          // briefly after autoWithdrawAll, so back off and retry.
          let topUpOk = false;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await adapter.topUp({ provider_player_id: loginId, amount: balance, reference_id: refId, currency: 'MYR' });
              topUpOk = true;
              break;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              if (msg.includes('37153') && attempt < 2) {
                await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
                continue;
              }
              throw err;
            }
          }
          if (topUpOk) {
            const { rowCount } = await pool.query(
              `UPDATE users SET total_withdraw = total_withdraw + $1
               WHERE id = $2 AND (total_deposit - total_withdraw) >= $1`,
              [balance, userId],
            );
            if (rowCount && rowCount > 0) {
              console.log(`[megaapp-callback] topUp ok: userId=${userId} amount=${balance} loginId=${loginId}`);
            }
          }
        }
      }
    } catch (err) {
      // Non-fatal: player can still play with existing MEGA balance
      console.error('[megaapp-callback] topUp failed:', err);
    }
  }

  return NextResponse.json(result);
}
