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
import { adjustWallet } from '@/lib/services/wallet';

// System admin ID used as operator for automated game wallet changes.
// Set GAME_SYSTEM_ADMIN_ID env var to override (defaults to 1 = super-admin).
const SYSTEM_ADMIN_ID = parseInt(process.env.GAME_SYSTEM_ADMIN_ID ?? '1', 10);

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
  // 1. autoWithdrawAll — pull any leftover MEGA balance back to main wallet
  // 2. Atomically DEDUCT from main wallet first, THEN topUp to MEGA
  //    (deduct-first prevents double-credit if topUp fails after deduction)
  //    If topUp fails, the deduction is rolled back.
  // This runs on every app login so balances stay consistent even when the
  // player exits and re-enters without going through the website launch route.
  // NOTE: The launch route does NOT sync wallets — callback is the single
  // authoritative sync point, eliminating the launch ↔ callback race condition.
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
        const ts = Date.now();

        // Step 1: pull any leftover MEGA balance back to main wallet
        // Records a wallet_transactions row (PAYMENT_GATEWAY / Credit)
        try {
          const returned = await adapter.autoWithdrawAll(loginId);
          if (returned > 0) {
            const wdClient = await pool.connect();
            try {
              await wdClient.query('BEGIN');
              await adjustWallet(wdClient, {
                userId,
                type:            'PAYMENT_GATEWAY',
                direction:       'C',
                amount:          returned,
                gateway:         'MEGAAPP',
                referenceNumber: `MEGAWD-${userId}-${ts}`,
                remark:          `[MEGAAPP] Transfer Out — auto withdraw from MEGA`,
                operatorAdminId: SYSTEM_ADMIN_ID,
              });
              await wdClient.query('COMMIT');
              console.log(`[megaapp-callback] autoWithdraw ok: userId=${userId} returned=${returned} loginId=${loginId}`);
            } catch (e) {
              await wdClient.query('ROLLBACK').catch(() => undefined);
              throw e;
            } finally {
              wdClient.release();
            }
          }
        } catch (err) {
          console.warn('[megaapp-callback] autoWithdraw failed (non-fatal):', (err instanceof Error ? err.message : String(err)));
        }

        // Step 2: read fresh main wallet balance
        const { rows: balRows } = await pool.query<{ available_balance: string }>(
          `SELECT available_balance FROM users WHERE id = $1 LIMIT 1`,
          [userId],
        );
        const balance = parseFloat(balRows[0]?.available_balance ?? '0');

        if (balance > 0) {
          // Step 3: DEDUCT from main wallet FIRST using adjustWallet (atomic + FOR UPDATE lock)
          // adjustWallet throws "Insufficient balance" if balance changed since we read it —
          // the throw is caught below and topUp is skipped, preventing double-deduction.
          const refId = `MEGAUP-${userId}-${ts}`;
          let deductOk = false;
          const deductClient = await pool.connect();
          try {
            await deductClient.query('BEGIN');
            await adjustWallet(deductClient, {
              userId,
              type:            'PAYMENT_GATEWAY',
              direction:       'D',
              amount:          balance,
              gateway:         'MEGAAPP',
              referenceNumber: refId,
              remark:          `[MEGAAPP] Transfer In — top up to MEGA`,
              operatorAdminId: SYSTEM_ADMIN_ID,
            });
            await deductClient.query('COMMIT');
            deductOk = true;
          } catch (err) {
            await deductClient.query('ROLLBACK').catch(() => undefined);
            console.warn(`[megaapp-callback] deduction failed (balance insufficient or concurrent): userId=${userId} balance=${balance}:`, err instanceof Error ? err.message : String(err));
          } finally {
            deductClient.release();
          }

          if (deductOk) {
            // Step 4: topUp to MEGA (retry on distributed lock error 37153)
            let topUpOk = false;
            try {
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
            } catch (err) {
              // Step 5: topUp failed — roll back the deduction via a correction credit
              const errMsg = err instanceof Error ? err.message : String(err);
              console.error(`[megaapp-callback] topUp failed, rolling back deduction userId=${userId} amount=${balance}: ${errMsg}`);
              const rbClient = await pool.connect();
              try {
                await rbClient.query('BEGIN');
                await adjustWallet(rbClient, {
                  userId,
                  type:            'CORRECTION',
                  direction:       'C',
                  amount:          balance,
                  gateway:         'MEGAAPP',
                  referenceNumber: `MEGAUP-ROLLBACK-${userId}-${ts}`,
                  remark:          `[MEGAAPP] Transfer In Rollback — top up failed: ${errMsg.slice(0, 80)}`,
                  operatorAdminId: SYSTEM_ADMIN_ID,
                });
                await rbClient.query('COMMIT');
              } catch (rbErr) {
                await rbClient.query('ROLLBACK').catch(() => undefined);
                console.error(`[megaapp-callback] CRITICAL: rollback also failed userId=${userId} amount=${balance}:`, rbErr instanceof Error ? rbErr.message : String(rbErr));
              } finally {
                rbClient.release();
              }
            }

            if (topUpOk) {
              console.log(`[megaapp-callback] topUp ok: userId=${userId} amount=${balance} loginId=${loginId}`);
            }
          }
        }
      }
    } catch (err) {
      // Non-fatal: player can still play with existing MEGA balance
      console.error('[megaapp-callback] wallet sync failed:', err);
    }
  }

  return NextResponse.json(result);
}
