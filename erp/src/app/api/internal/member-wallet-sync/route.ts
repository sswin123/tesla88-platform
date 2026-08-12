// POST /api/internal/member-wallet-sync
//
// Internal service-to-service endpoint — called by the Website container, not a browser.
// Auth: BOT_RELAY_AUTH_TOKEN Bearer (middleware lets /api/internal/ pass without JWT).
//
// Pulls any remaining balance from all TRANSFER-wallet providers back to the member's
// main wallet. SEAMLESS providers are skipped. Designed to work with any provider
// that implements autoWithdrawAll — not MEGA-specific.
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { createGamingPlatform } from '@/lib/providers';
import { adjustWallet } from '@/lib/services/wallet';
import { TransactionRepository } from '@/lib/providers/repositories/TransactionRepository';
import { GamingActivityService } from '@/lib/services/gaming-activity';
import { GamingEventType } from '@/lib/providers/types/metadata.types';

const SYSTEM_ADMIN_ID = parseInt(process.env.GAME_SYSTEM_ADMIN_ID ?? '1', 10);
const txRepo = new TransactionRepository();

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.BOT_RELAY_AUTH_TOKEN ?? '';
  if (!expected) return false;
  const auth = req.headers.get('authorization') ?? '';
  const [scheme, token] = auth.split(' ');
  return scheme === 'Bearer' && token === expected;
}

interface SyncResult {
  provider_code:  string;
  provider_name:  string;
  wallet_type:    string;
  returned:       number;
  balance_before: number;
  balance_after:  number;
  status:         'synced' | 'empty' | 'skipped' | 'error';
  duration_ms:    number;
  wallet_tx_id:   string | null;
  error?:         string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { user_id?: unknown };
  try {
    body = await req.json() as { user_id?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const userId = typeof body.user_id === 'number' ? body.user_id : parseInt(String(body.user_id ?? ''), 10);
  if (!userId || isNaN(userId)) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  }

  console.log(`[member-wallet-sync] ▶ userId=${userId}`);

  // Get all provider accounts for this user, joined with provider wallet_type + public_id
  const { rows: accounts } = await pool.query<{
    provider_code:     string;
    provider_name:     string;
    wallet_type:       string;
    provider_login_id: string;
    brand_code:        string;
    user_public_id:    string;
  }>(
    `SELECT pa.provider_code,
            gp.name         AS provider_name,
            gp.wallet_type,
            pa.provider_login_id,
            b.code          AS brand_code,
            u.public_id     AS user_public_id
     FROM provider_accounts pa
     JOIN gp_providers   gp ON gp.code = pa.provider_code
     JOIN brand_providers bp ON bp.provider_id = gp.id AND bp.status IN ('ACTIVE', 'TESTING')
     JOIN brands          b  ON b.id = bp.brand_id
     JOIN users           u  ON u.id = pa.user_id
     WHERE pa.user_id = $1`,
    [userId],
  );

  if (accounts.length === 0) {
    console.log(`[member-wallet-sync] no provider accounts for userId=${userId}`);
    return NextResponse.json({ synced: [] });
  }

  const results: SyncResult[] = [];
  const platform = createGamingPlatform();

  // Read initial balance once
  const { rows: initBal } = await pool.query<{ available_balance: string }>(
    `SELECT available_balance FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  let runningBalance = parseFloat(initBal[0]?.available_balance ?? '0');

  for (const acc of accounts) {
    const { provider_code, provider_name, wallet_type, provider_login_id, brand_code, user_public_id } = acc;
    const startMs = Date.now();

    if (wallet_type !== 'TRANSFER') {
      console.log(`[member-wallet-sync] ${provider_code}: SEAMLESS — skip`);
      results.push({
        provider_code, provider_name, wallet_type,
        returned: 0, balance_before: runningBalance, balance_after: runningBalance,
        status: 'skipped', duration_ms: 0, wallet_tx_id: null,
      });
      continue;
    }

    console.log(`[member-wallet-sync] ${provider_code}: TRANSFER — autoWithdrawAll loginId="${provider_login_id}"`);

    // Load adapter dynamically — works for any TRANSFER provider
    let adapter: Record<string, unknown>;
    try {
      adapter = await platform.brandManager.getAdapter(brand_code, provider_code) as unknown as Record<string, unknown>;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[member-wallet-sync] ${provider_code}: adapter load failed: ${msg}`);
      results.push({
        provider_code, provider_name, wallet_type,
        returned: 0, balance_before: runningBalance, balance_after: runningBalance,
        status: 'error', duration_ms: Date.now() - startMs, wallet_tx_id: null,
        error: `Adapter load failed: ${msg}`,
      });
      continue;
    }

    if (typeof adapter['autoWithdrawAll'] !== 'function') {
      console.warn(`[member-wallet-sync] ${provider_code}: adapter has no autoWithdrawAll — skip`);
      results.push({
        provider_code, provider_name, wallet_type,
        returned: 0, balance_before: runningBalance, balance_after: runningBalance,
        status: 'skipped', duration_ms: Date.now() - startMs, wallet_tx_id: null,
        error: 'Provider does not support autoWithdrawAll',
      });
      continue;
    }

    // Pull balance from provider
    let returned = 0;
    try {
      returned = await (adapter['autoWithdrawAll'] as (loginId: string) => Promise<number>)(provider_login_id);
      console.log(`[member-wallet-sync] ${provider_code}: autoWithdrawAll returned=${returned}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 37123 = no balance (MEGA non-fatal); other providers may use different codes
      if (msg.includes('37123')) {
        console.log(`[member-wallet-sync] ${provider_code}: wallet empty (37123) — OK`);
        results.push({
          provider_code, provider_name, wallet_type,
          returned: 0, balance_before: runningBalance, balance_after: runningBalance,
          status: 'empty', duration_ms: Date.now() - startMs, wallet_tx_id: null,
        });
        continue;
      }
      console.error(`[member-wallet-sync] ${provider_code}: autoWithdrawAll error: ${msg}`);

      // Record failed attempt in provider_transactions
      await txRepo.create({
        provider:       provider_code,
        transaction_id: randomUUID(),
        reference_id:   `${provider_code}WD-SYNC-${userId}-${Date.now()}`,
        type:           'FUND_RETURN',
        status:         'FAILED',
        user_id:        userId,
        user_public_id,
        amount:         0,
        currency:       'MYR',
        before_balance: runningBalance,
        after_balance:  runningBalance,
        error_message:  msg,
        metadata:       { trigger: 'MEMBER_REFRESH' },
      }).catch(e => console.warn(`[member-wallet-sync] provider_transactions write failed:`, e));

      results.push({
        provider_code, provider_name, wallet_type,
        returned: 0, balance_before: runningBalance, balance_after: runningBalance,
        status: 'error', duration_ms: Date.now() - startMs, wallet_tx_id: null,
        error: 'Provider sync failed',
      });
      continue;
    }

    if (returned <= 0) {
      results.push({
        provider_code, provider_name, wallet_type,
        returned: 0, balance_before: runningBalance, balance_after: runningBalance,
        status: 'empty', duration_ms: Date.now() - startMs, wallet_tx_id: null,
      });
      continue;
    }

    // Credit returned amount to main wallet
    const ts = Date.now();
    const refId = `${provider_code}WD-SYNC-${userId}-${ts}`;
    const balanceBefore = runningBalance;
    let balanceAfter = runningBalance;
    let walletTxId: string | null = null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const wtRow = await adjustWallet(client, {
        userId,
        type:            'PAYMENT_GATEWAY',
        direction:       'C',
        amount:          returned,
        gateway:         provider_code,
        referenceNumber: refId,
        remark:          `[${provider_code}] Transfer Out`,
        operatorAdminId: SYSTEM_ADMIN_ID,
      });
      await client.query('COMMIT');
      walletTxId   = wtRow.id;
      balanceAfter = parseFloat(wtRow.balance_after);
      runningBalance = balanceAfter;
      console.log(`[member-wallet-sync] ${provider_code}: ✓ credited ${returned} → balance ${balanceBefore} → ${balanceAfter} wallet_tx=${walletTxId}`);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[member-wallet-sync] ${provider_code}: adjustWallet failed: ${msg}`);
      results.push({
        provider_code, provider_name, wallet_type,
        returned, balance_before: balanceBefore, balance_after: balanceBefore,
        status: 'error', duration_ms: Date.now() - startMs, wallet_tx_id: null,
        error: `Failed to credit wallet: ${msg}`,
      });
      continue;
    } finally {
      client.release();
    }

    const durationMs = Date.now() - startMs;

    // Write provider_transactions record (FUND_RETURN = Transfer Out)
    await txRepo.create({
      provider:       provider_code,
      transaction_id: walletTxId ?? randomUUID(),
      reference_id:   refId,
      type:           'FUND_RETURN',
      status:         'SUCCESS',
      user_id:        userId,
      user_public_id,
      amount:         returned,
      currency:       'MYR',
      before_balance: balanceBefore,
      after_balance:  balanceAfter,
      metadata:       { trigger: 'MEMBER_REFRESH', duration_ms: durationMs },
    }).catch(e => console.warn(`[member-wallet-sync] provider_transactions write failed:`, e));

    void GamingActivityService.record({
      memberId:      userId,
      providerCode:  provider_code,
      eventType:     GamingEventType.TransferOut,
      amount:        returned,
      balanceBefore: balanceBefore,
      balanceAfter:  balanceAfter,
      referenceType: 'wallet_transaction',
      referenceId:   walletTxId ? parseInt(walletTxId, 10) : null,
      operatorType:  'MEMBER',
      operatorId:    userId,
      metadata:      { ref_id: refId, duration_ms: durationMs },
    });

    results.push({
      provider_code, provider_name, wallet_type,
      returned, balance_before: balanceBefore, balance_after: balanceAfter,
      status: 'synced', duration_ms: durationMs, wallet_tx_id: walletTxId,
    });
  }

  console.log(`[member-wallet-sync] ◀ userId=${userId} done. providers=${results.length}`);
  return NextResponse.json({ synced: results });
}
