// erp/src/app/api/games/megaapp/callback/[action]/route.ts
//
// MEGA calls this endpoint when a player logs into the MEGA888 native app.
// Method: open.operator.user.login
// URL configured in MEGA admin: https://yoursite.com/api/games/megaapp/callback/login
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

  const rpcId     = envelope.id   ?? '';
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

  const loginSuccess = (result['result'] as Record<string, unknown> | null)?.['success'] === '1';
  console.log(`[megaapp-callback] login success=${loginSuccess}`);

  if (loginSuccess) {
    const loginId = String(rpcParams['loginId'] ?? '');
    console.log(`[megaapp-callback] ── TRANSFER OUT START loginId="${loginId}" ──`);

    try {
      const { rows: paRows } = await pool.query<{ user_id: number; user_public_id: string }>(
        `SELECT pa.user_id, u.public_id AS user_public_id
         FROM provider_accounts pa
         JOIN users u ON u.id = pa.user_id
         WHERE pa.provider_code = 'MEGAAPP' AND pa.provider_login_id = $1 LIMIT 1`,
        [loginId],
      );
      const userId       = paRows[0]?.user_id;
      const userPublicId = paRows[0]?.user_public_id ?? '';

      if (!userId) {
        console.error(`[megaapp-callback] ✗ CRITICAL: no provider_accounts record for loginId="${loginId}" — Transfer Out SKIPPED`);
      } else {
        console.log(`[megaapp-callback] ✓ found userId=${userId}`);
        const ts = Date.now();

        // ── Step 1: autoWithdrawAll (Transfer Out) ──────────────────────────
        console.log(`[megaapp-callback] calling autoWithdrawAll(loginId="${loginId}")`);
        let returned = 0;
        try {
          returned = await adapter.autoWithdrawAll(loginId);
          console.log(`[megaapp-callback] autoWithdrawAll result: returned=${returned}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('37123')) {
            console.log(`[megaapp-callback] autoWithdrawAll: MEGA wallet already empty (37123) — OK`);
          } else {
            console.warn(`[megaapp-callback] autoWithdrawAll error (non-fatal, continuing): ${msg}`);
          }
        }

        if (returned > 0) {
          const wdRefId = `MEGAAPPWD-${userId}-${ts}`;
          console.log(`[megaapp-callback] crediting ${returned} back to main wallet (Transfer Out)`);
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
            console.log(`[megaapp-callback] ✓ Transfer Out complete: balance ${balBefore} → ${balAfter}`);

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
            }).catch(e => console.warn('[megaapp-callback] provider_transactions write failed:', e));

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
            console.error(`[megaapp-callback] ✗ adjustWallet (Transfer Out) failed:`, e);
          } finally {
            wdClient.release();
          }
        }

        console.log(`[megaapp-callback] ── TRANSFER OUT END userId=${userId} ──`);
      }
    } catch (err) {
      console.error('[megaapp-callback] ✗ wallet sync outer error (non-fatal):', err);
    }
  }

  console.log(`[megaapp-callback] ◀ RETURNING response to MEGA:`, JSON.stringify(result));
  console.log(`${'='.repeat(60)}\n`);

  return NextResponse.json(result);
}
