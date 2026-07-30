// POST /api/mega/callback
//
// MEGA888 calls this URL when a player logs into the native app.
// Configured in MEGA agent management portal as the operator login callback.
//
// Handles JSON-RPC 2.0 method: open.operator.user.login
// Body format: json={...} (URL-encoded) or raw JSON
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createGamingPlatform } from '@/lib/providers';
import type { MegaAppAdapter } from '@/lib/providers/adapters/megaapp/MegaAppAdapter';
import pool from '@/lib/db';
import { adjustWallet } from '@/lib/services/wallet';
import { TransactionRepository } from '@/lib/providers/repositories/TransactionRepository';
import { ActivityLogService } from '@/lib/services/activity-log';

const SYSTEM_ADMIN_ID = parseInt(process.env.GAME_SYSTEM_ADMIN_ID ?? '1', 10);
const txRepo = new TransactionRepository();

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ct = request.headers.get('content-type') ?? '(none)';
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown';

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[mega/callback] ▶ RECEIVED POST content-type="${ct}" ip=${ip}`);
  console.log(`${'='.repeat(60)}`);

  // Read raw body
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err) {
    console.error('[mega/callback] ✗ failed to read body:', err);
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, result: null, error: { code: '700', message: 'Cannot read body' } },
    );
  }

  console.log(`[mega/callback] RAW BODY (len=${rawBody.length}):`);
  console.log(rawBody.slice(0, 1000));

  // MEGA sends payload as URL-encoded: json={...}
  let jsonStr = rawBody;
  if (rawBody.startsWith('json=')) {
    jsonStr = decodeURIComponent(rawBody.slice('json='.length));
    console.log(`[mega/callback] decoded from form: ${jsonStr.slice(0, 500)}`);
  }

  let envelope: { jsonrpc?: string; id?: string; method?: string; params?: Record<string, unknown> };
  try {
    envelope = JSON.parse(jsonStr) as typeof envelope;
  } catch (err) {
    console.error('[mega/callback] ✗ JSON parse failed:', err, '| raw=', jsonStr.slice(0, 200));
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, result: null, error: { code: '700', message: 'Invalid JSON' } },
    );
  }

  const rpcId     = envelope.id     ?? '';
  const rpcMethod = envelope.method ?? '';
  const rpcParams = envelope.params ?? {};

  console.log(`[mega/callback] rpcId="${rpcId}" method="${rpcMethod}"`);
  console.log(`[mega/callback] loginId="${rpcParams['loginId']}" sn="${rpcParams['sn']}"`);

  // Find active MEGAAPP brand
  const { rows: bpRows } = await pool.query<{ brand_code: string }>(
    `SELECT b.code AS brand_code
     FROM brand_providers bp
     JOIN brands b       ON b.id = bp.brand_id
     JOIN gp_providers p ON p.id = bp.provider_id
     WHERE p.code = 'MEGAAPP' AND bp.status = 'ACTIVE'
     LIMIT 1`,
  );

  if (!bpRows[0]) {
    console.warn('[mega/callback] ✗ no active MEGAAPP brand found');
    return NextResponse.json({
      jsonrpc: '2.0', id: rpcId, result: null,
      error: { code: '21118', message: '系统正在维护中，请联系客服' },
    });
  }
  console.log(`[mega/callback] brand_code="${bpRows[0].brand_code}"`);

  // Load adapter
  let adapter: MegaAppAdapter;
  try {
    const platform = createGamingPlatform();
    adapter = await platform.brandManager.getAdapter(bpRows[0].brand_code, 'MEGAAPP') as MegaAppAdapter;
    console.log(`[mega/callback] ✓ adapter loaded`);
  } catch (err) {
    console.error('[mega/callback] ✗ failed to load adapter:', err);
    return NextResponse.json({
      jsonrpc: '2.0', id: rpcId, result: null,
      error: { code: '21118', message: '系统维护中' },
    });
  }

  // Verify digest + password via adapter
  let result: Record<string, unknown>;
  try {
    result = await adapter.handleLoginCallback(rpcId, rpcParams);
    console.log(`[mega/callback] handleLoginCallback result:`, JSON.stringify(result));
  } catch (err) {
    console.error('[mega/callback] ✗ handleLoginCallback threw:', err);
    return NextResponse.json({
      jsonrpc: '2.0', id: rpcId, result: null,
      error: { code: '37101', message: 'API调用异常' },
    });
  }

  // Check login success via result.result.success field
  const loginSuccess = (result['result'] as Record<string, unknown> | null)?.['success'] === '1';
  console.log(`[mega/callback] login success=${loginSuccess}`);

  if (loginSuccess) {
    const loginId = String(rpcParams['loginId'] ?? '');
    console.log(`[mega/callback] ── WALLET SYNC START loginId="${loginId}" ──`);

    try {
      // Find internal userId + public_id from loginId
      const { rows: paRows } = await pool.query<{ user_id: number; user_public_id: string }>(
        `SELECT pa.user_id, u.public_id AS user_public_id
         FROM provider_accounts pa
         JOIN users u ON u.id = pa.user_id
         WHERE pa.provider_code = 'MEGAAPP' AND pa.provider_login_id = $1 LIMIT 1`,
        [loginId],
      );
      const userId        = paRows[0]?.user_id;
      const userPublicId  = paRows[0]?.user_public_id ?? '';

      if (!userId) {
        console.error(`[mega/callback] ✗ CRITICAL: no provider_accounts record for loginId="${loginId}" — wallet sync SKIPPED`);
      } else {
        console.log(`[mega/callback] ✓ found userId=${userId}`);
        const ts = Date.now();

        // ── Step 1: autoWithdrawAll (Transfer Out) ──────────────────────────
        console.log(`[mega/callback] calling autoWithdrawAll(loginId="${loginId}")`);
        let returned = 0;
        try {
          returned = await adapter.autoWithdrawAll(loginId);
          console.log(`[mega/callback] autoWithdrawAll returned=${returned}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('37123')) {
            console.log(`[mega/callback] autoWithdrawAll: MEGA wallet already empty (37123)`);
          } else {
            console.warn(`[mega/callback] autoWithdrawAll failed (non-fatal): ${msg}`);
          }
        }

        if (returned > 0) {
          const wdRefId = `MEGAAPPWD-${userId}-${ts}`;
          const wdClient = await pool.connect();
          try {
            await wdClient.query('BEGIN');
            const wtRow = await adjustWallet(wdClient, {
              userId,
              type:            'PAYMENT_GATEWAY',
              direction:       'C',
              amount:          returned,
              gateway:         'MEGAAPP',
              referenceNumber: wdRefId,
              remark:          '[MEGAAPP] Transfer Out',
              operatorAdminId: SYSTEM_ADMIN_ID,
            });
            await wdClient.query('COMMIT');
            const balBefore = parseFloat(wtRow.balance_before);
            const balAfter  = parseFloat(wtRow.balance_after);
            console.log(`[mega/callback] ✓ Transfer Out: balance ${balBefore} → ${balAfter}`);

            // provider_transactions (FUND_RETURN = Transfer Out)
            await txRepo.create({
              provider:       'MEGAAPP',
              transaction_id: wtRow.id,
              reference_id:   wdRefId,
              type:           'FUND_RETURN',
              status:         'SUCCESS',
              user_id:        userId,
              user_public_id: userPublicId,
              amount:         returned,
              currency:       'MYR',
              before_balance: balBefore,
              after_balance:  balAfter,
              metadata:       { trigger: 'LOGIN_CALLBACK' },
            }).catch(e => console.warn('[mega/callback] provider_transactions write failed:', e));

            // activity log
            await ActivityLogService.log({
              member_id:      userId,
              category:       'BALANCE',
              action:         'Transfer Out',
              title:          'MEGA888(APP) — Transfer Out',
              description:    `Recovered RM ${returned.toFixed(2)} from MEGA888(APP) on login`,
              amount:         returned,
              balance_before: balBefore,
              balance_after:  balAfter,
              reference_type: 'wallet_transaction',
              reference_id:   parseInt(wtRow.id, 10) || null,
              operator_type:  'SYSTEM',
              operator_id:    SYSTEM_ADMIN_ID,
              source:         'API',
              level:          'INFO',
              remark:         '[MEGAAPP] Transfer Out',
              metadata:       { provider_code: 'MEGAAPP', returned, ref_id: wdRefId },
            });
          } catch (e) {
            await wdClient.query('ROLLBACK').catch(() => undefined);
            console.error(`[mega/callback] ✗ adjustWallet Transfer Out failed:`, e);
          } finally {
            wdClient.release();
          }
        }

        // ── Step 2: read fresh balance ──────────────────────────────────────
        const { rows: balRows } = await pool.query<{ available_balance: string }>(
          `SELECT available_balance FROM users WHERE id = $1 LIMIT 1`,
          [userId],
        );
        const balance = parseFloat(balRows[0]?.available_balance ?? '0');
        console.log(`[mega/callback] main wallet available_balance=${balance}`);

        if (balance <= 0) {
          console.log(`[mega/callback] balance=${balance} ≤ 0 — no Transfer In needed`);
        } else {
          // ── Step 3: deduct from main wallet first (deduct-first pattern) ──
          const refId = `MEGAAPPUP-${userId}-${ts}`;
          let deductOk = false;
          let deductWtRow: Awaited<ReturnType<typeof adjustWallet>> | null = null;

          console.log(`[mega/callback] DEDUCTING ${balance} from main wallet`);
          const deductClient = await pool.connect();
          try {
            await deductClient.query('BEGIN');
            deductWtRow = await adjustWallet(deductClient, {
              userId,
              type:            'PAYMENT_GATEWAY',
              direction:       'D',
              amount:          balance,
              gateway:         'MEGAAPP',
              referenceNumber: refId,
              remark:          '[MEGAAPP] Transfer In',
              operatorAdminId: SYSTEM_ADMIN_ID,
            });
            await deductClient.query('COMMIT');
            deductOk = true;
            const balBefore = parseFloat(deductWtRow.balance_before);
            const balAfter  = parseFloat(deductWtRow.balance_after);
            console.log(`[mega/callback] ✓ deduction OK: balance ${balBefore} → ${balAfter}`);

            // provider_transactions (FUND_REQUEST = Transfer In deduction step)
            await txRepo.create({
              provider:       'MEGAAPP',
              transaction_id: deductWtRow.id,
              reference_id:   refId,
              type:           'FUND_REQUEST',
              status:         'PENDING',
              user_id:        userId,
              user_public_id: userPublicId,
              amount:         balance,
              currency:       'MYR',
              before_balance: balBefore,
              after_balance:  balAfter,
              metadata:       { trigger: 'LOGIN_CALLBACK', step: 'DEDUCT' },
            }).catch(e => console.warn('[mega/callback] provider_transactions write failed:', e));
          } catch (err) {
            await deductClient.query('ROLLBACK').catch(() => undefined);
            console.error(`[mega/callback] ✗ deduction FAILED: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            deductClient.release();
          }

          if (deductOk && deductWtRow) {
            // ── Step 4: topUp to MEGA (retry on 37153) ─────────────────────
            let topUpOk = false;
            const deductBalBefore = parseFloat(deductWtRow.balance_before);
            const deductBalAfter  = parseFloat(deductWtRow.balance_after);

            console.log(`[mega/callback] calling topUp: loginId="${loginId}" amount=${balance} refId="${refId}"`);
            try {
              for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                  console.log(`[mega/callback] topUp attempt ${attempt}/3 ...`);
                  const topUpResult = await adapter.topUp({
                    provider_player_id: loginId,
                    amount:             balance,
                    reference_id:       refId,
                    currency:           'MYR',
                  });
                  topUpOk = true;
                  console.log(`[mega/callback] ✓ topUp SUCCESS: MEGA balance after=${topUpResult.balance}`);

                  // Update provider_transactions to SUCCESS
                  await txRepo.create({
                    provider:       'MEGAAPP',
                    transaction_id: randomUUID(),
                    reference_id:   refId,
                    type:           'FUND_REQUEST',
                    status:         'SUCCESS',
                    user_id:        userId,
                    user_public_id: userPublicId,
                    amount:         balance,
                    currency:       'MYR',
                    before_balance: deductBalBefore,
                    after_balance:  topUpResult.balance,
                    metadata:       { trigger: 'LOGIN_CALLBACK', step: 'TOPUP', mega_balance: topUpResult.balance },
                  }).catch(e => console.warn('[mega/callback] provider_transactions write failed:', e));

                  // Activity log — Transfer In success
                  await ActivityLogService.log({
                    member_id:      userId,
                    category:       'BALANCE',
                    action:         'Transfer In',
                    title:          'MEGA888(APP) — Transfer In',
                    description:    `Transferred RM ${balance.toFixed(2)} to MEGA888(APP) on login`,
                    amount:         balance,
                    balance_before: deductBalBefore,
                    balance_after:  deductBalAfter,
                    reference_type: 'wallet_transaction',
                    reference_id:   parseInt(deductWtRow.id, 10) || null,
                    operator_type:  'SYSTEM',
                    operator_id:    SYSTEM_ADMIN_ID,
                    source:         'API',
                    level:          'INFO',
                    remark:         '[MEGAAPP] Transfer In',
                    metadata:       { provider_code: 'MEGAAPP', amount: balance, ref_id: refId, mega_balance_after: topUpResult.balance },
                  });
                  break;
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  console.error(`[mega/callback] topUp attempt ${attempt} FAILED: ${msg}`);
                  if (msg.includes('37153') && attempt < 3) {
                    const delay = 3000 * attempt;
                    console.log(`[mega/callback] 37153 — retrying in ${delay}ms`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                  }
                  throw err;
                }
              }
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              console.error(`[mega/callback] ✗ topUp FAILED, rolling back. userId=${userId} amount=${balance}: ${errMsg}`);

              const rbClient = await pool.connect();
              try {
                await rbClient.query('BEGIN');
                const rbWtRow = await adjustWallet(rbClient, {
                  userId,
                  type:            'CORRECTION',
                  direction:       'C',
                  amount:          balance,
                  gateway:         'MEGAAPP',
                  referenceNumber: `MEGAAPPUP-ROLLBACK-${userId}-${ts}`,
                  remark:          '[MEGAAPP] Rollback',
                  operatorAdminId: SYSTEM_ADMIN_ID,
                });
                await rbClient.query('COMMIT');
                const rbBalBefore = parseFloat(rbWtRow.balance_before);
                const rbBalAfter  = parseFloat(rbWtRow.balance_after);
                console.log(`[mega/callback] ✓ rollback OK: balance restored to ${rbBalAfter}`);

                // provider_transactions — Rollback
                await txRepo.create({
                  provider:       'MEGAAPP',
                  transaction_id: rbWtRow.id,
                  reference_id:   `MEGAAPPUP-ROLLBACK-${userId}-${ts}`,
                  type:           'ROLLBACK',
                  status:         'SUCCESS',
                  user_id:        userId,
                  user_public_id: userPublicId,
                  amount:         balance,
                  currency:       'MYR',
                  before_balance: rbBalBefore,
                  after_balance:  rbBalAfter,
                  error_message:  errMsg.slice(0, 255),
                  metadata:       { trigger: 'LOGIN_CALLBACK', original_ref: refId },
                }).catch(e => console.warn('[mega/callback] provider_transactions write failed:', e));

                // Activity log — Rollback
                await ActivityLogService.log({
                  member_id:      userId,
                  category:       'BALANCE',
                  action:         'Rollback',
                  title:          'MEGA888(APP) — Transfer In Rollback',
                  description:    `RM ${balance.toFixed(2)} restored after topUp failure: ${errMsg.slice(0, 100)}`,
                  amount:         balance,
                  balance_before: rbBalBefore,
                  balance_after:  rbBalAfter,
                  reference_type: 'wallet_transaction',
                  reference_id:   parseInt(rbWtRow.id, 10) || null,
                  operator_type:  'SYSTEM',
                  operator_id:    SYSTEM_ADMIN_ID,
                  source:         'API',
                  level:          'WARNING',
                  remark:         '[MEGAAPP] Rollback',
                  metadata:       { provider_code: 'MEGAAPP', amount: balance, error: errMsg.slice(0, 255) },
                });
              } catch (rbErr) {
                await rbClient.query('ROLLBACK').catch(() => undefined);
                console.error(`[mega/callback] ✗✗ CRITICAL: rollback FAILED userId=${userId} amount=${balance}:`, rbErr instanceof Error ? rbErr.message : String(rbErr));
                console.error(`[mega/callback] MANUAL INTERVENTION REQUIRED: userId=${userId} missing ${balance} MYR`);

                await ActivityLogService.log({
                  member_id:      userId,
                  category:       'BALANCE',
                  action:         'Rollback',
                  title:          'MEGA888(APP) — Rollback FAILED (CRITICAL)',
                  description:    `CRITICAL: RM ${balance.toFixed(2)} lost — topUp failed AND rollback failed. Manual intervention required.`,
                  amount:         balance,
                  operator_type:  'SYSTEM',
                  source:         'API',
                  level:          'CRITICAL',
                  remark:         '[MEGAAPP] Rollback — CRITICAL FAILURE',
                  metadata:       { provider_code: 'MEGAAPP', amount: balance, topup_error: errMsg.slice(0, 255) },
                });
              } finally {
                rbClient.release();
              }
            }

            if (!topUpOk) {
              console.warn(`[mega/callback] Transfer In FAILED: userId=${userId} amount=${balance}`);
            }
          }
        }

        console.log(`[mega/callback] ── WALLET SYNC END userId=${userId} ──`);
      }
    } catch (err) {
      console.error('[mega/callback] ✗ wallet sync outer error (non-fatal):', err);
    }
  }

  console.log(`[mega/callback] ◀ RETURNING:`, JSON.stringify(result));
  console.log(`${'='.repeat(60)}\n`);

  return NextResponse.json(result);
}
