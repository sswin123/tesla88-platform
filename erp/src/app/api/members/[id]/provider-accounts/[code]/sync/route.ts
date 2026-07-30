// POST /api/members/[id]/provider-accounts/[code]/sync
// Admin-triggered: pull any remaining balance from a TRANSFER-wallet provider
// back to the member's main wallet.
// Requires permission: member.provider_account.sync
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';
import { logAudit } from '@/lib/repositories/audit_repo';
import { createGamingPlatform } from '@/lib/providers';
import type { MegaAppAdapter } from '@/lib/providers/adapters/megaapp/MegaAppAdapter';
import { adjustWallet } from '@/lib/services/wallet';
import { TransactionRepository } from '@/lib/providers/repositories/TransactionRepository';
import { ActivityLogService } from '@/lib/services/activity-log';

const SYSTEM_ADMIN_ID = parseInt(process.env.GAME_SYSTEM_ADMIN_ID ?? '1', 10);
const txRepo = new TransactionRepository();

type Params = { params: Promise<{ id: string; code: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('member.provider_account.sync');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, code } = await params;
  const uid = parseInt(id, 10);
  if (isNaN(uid)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const upperCode = code.toUpperCase();
  const startMs = Date.now();

  // Get the player's provider account + public_id
  const { rows: paRows } = await pool.query<{
    provider_login_id: string;
    provider_code:     string;
    user_public_id:    string;
  }>(
    `SELECT pa.provider_login_id, pa.provider_code, u.public_id AS user_public_id
     FROM provider_accounts pa
     JOIN users u ON u.id = pa.user_id
     WHERE pa.user_id = $1 AND pa.provider_code = $2 LIMIT 1`,
    [uid, upperCode],
  );

  const pa = paRows[0];
  if (!pa) {
    return NextResponse.json({ error: `No ${upperCode} account found for this member` }, { status: 404 });
  }

  // Verify it's a TRANSFER wallet provider
  const { rows: provRows } = await pool.query<{ wallet_type: string; code: string; name: string }>(
    `SELECT gp.wallet_type, gp.code, gp.name
     FROM brand_providers bp
     JOIN gp_providers gp ON gp.id = bp.provider_id
     WHERE gp.code = $1 AND bp.status = 'ACTIVE' LIMIT 1`,
    [upperCode],
  );

  const provider = provRows[0];
  if (!provider) {
    return NextResponse.json({ error: `Provider ${upperCode} not active` }, { status: 400 });
  }

  if (provider.wallet_type !== 'TRANSFER') {
    return NextResponse.json(
      { error: `Provider ${upperCode} is not a TRANSFER wallet — sync not applicable` },
      { status: 400 },
    );
  }

  // Get adapter
  const { rows: bpRows } = await pool.query<{ brand_code: string }>(
    `SELECT b.code AS brand_code
     FROM brand_providers bp
     JOIN brands b ON b.id = bp.brand_id
     JOIN gp_providers gp ON gp.id = bp.provider_id
     WHERE gp.code = $1 AND bp.status = 'ACTIVE' LIMIT 1`,
    [upperCode],
  );

  if (!bpRows[0]) {
    return NextResponse.json({ error: 'No active brand found for this provider' }, { status: 503 });
  }

  const platform = createGamingPlatform();
  const adapter = await platform.brandManager.getAdapter(bpRows[0].brand_code, upperCode) as MegaAppAdapter;

  const loginId = pa.provider_login_id;
  const refId   = `${upperCode}WD-ADMIN-${uid}-${Date.now()}`;

  // Read current wallet balance before sync
  const { rows: walletBefore } = await pool.query<{ available_balance: string }>(
    `SELECT available_balance FROM users WHERE id = $1 LIMIT 1`,
    [uid],
  );
  const balanceBefore = parseFloat(walletBefore[0]?.available_balance ?? '0');

  // Pull provider balance back to main wallet
  let returned = 0;
  try {
    returned = await adapter.autoWithdrawAll(loginId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // error 37123 = "No balance to withdraw" — non-fatal
    if (!msg.includes('37123')) {
      console.error(`[provider-accounts/sync] autoWithdrawAll failed userId=${uid}:`, msg);

      await txRepo.create({
        provider:       upperCode,
        transaction_id: randomUUID(),
        reference_id:   refId,
        type:           'FUND_RETURN',
        status:         'FAILED',
        user_id:        uid,
        user_public_id: pa.user_public_id,
        amount:         0,
        currency:       'MYR',
        before_balance: balanceBefore,
        after_balance:  balanceBefore,
        error_message:  msg,
        metadata:       { trigger: 'ADMIN_SYNC', admin_id: payload.sub },
      }).catch(() => undefined);

      return NextResponse.json({ error: `Sync failed: ${msg}` }, { status: 502 });
    }
  }

  // Credit returned amount via adjustWallet (writes wallet_transactions record)
  let balanceAfter = balanceBefore;
  let walletTxId: string | null = null;

  if (returned > 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const wtRow = await adjustWallet(client, {
        userId:          uid,
        type:            'PAYMENT_GATEWAY',
        direction:       'C',
        amount:          returned,
        gateway:         upperCode,
        referenceNumber: refId,
        remark:          `[${upperCode}] Admin Sync`,
        operatorAdminId: payload.sub,
      });
      await client.query('COMMIT');
      walletTxId   = wtRow.id;
      balanceAfter = parseFloat(wtRow.balance_after);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error(`[provider-accounts/sync] adjustWallet failed userId=${uid}:`, e);
      return NextResponse.json({ error: 'Failed to credit wallet' }, { status: 500 });
    } finally {
      client.release();
    }
  }

  const durationMs = Date.now() - startMs;

  // Write provider_transactions record
  await txRepo.create({
    provider:       upperCode,
    transaction_id: walletTxId ?? randomUUID(),
    reference_id:   refId,
    type:           'FUND_RETURN',
    status:         returned > 0 ? 'SUCCESS' : 'SUCCESS',
    user_id:        uid,
    user_public_id: pa.user_public_id,
    amount:         returned,
    currency:       'MYR',
    before_balance: balanceBefore,
    after_balance:  balanceAfter,
    metadata:       { trigger: 'ADMIN_SYNC', admin_id: payload.sub, duration_ms: durationMs },
  }).catch(e => console.warn(`[provider-accounts/sync] provider_transactions write failed:`, e));

  // Write member activity log
  await ActivityLogService.log({
    member_id:      uid,
    category:       'BALANCE',
    action:         'Admin Sync',
    title:          `${provider.name} — Admin Sync`,
    description:    returned > 0
      ? `Admin recovered RM ${returned.toFixed(2)} from ${provider.name}`
      : `Admin sync triggered — no balance in ${provider.name}`,
    amount:         returned > 0 ? returned : null,
    balance_before: balanceBefore,
    balance_after:  balanceAfter,
    reference_type: 'wallet_transaction',
    reference_id:   walletTxId ? parseInt(walletTxId, 10) : null,
    operator_type:  'STAFF',
    operator_id:    payload.sub,
    source:         'ERP',
    level:          'INFO',
    remark:         `[${upperCode}] Admin Sync — triggered by admin ${payload.sub} (${durationMs}ms)`,
    metadata:       { provider_code: upperCode, returned, ref_id: refId, duration_ms: durationMs },
  });

  await logAudit({
    admin_id:    payload.sub,
    action:      'MEMBER_PROVIDER_SYNC',
    target_type: 'member',
    target_id:   uid,
    old_value:   { provider: upperCode, wallet_before: balanceBefore, mega_returned: 0 },
    new_value:   { provider: upperCode, wallet_after: balanceAfter, mega_returned: returned },
  });

  return NextResponse.json({
    ok:             true,
    returned,
    balance_before: balanceBefore,
    balance_after:  balanceAfter,
    wallet_tx_id:   walletTxId,
    duration_ms:    durationMs,
  });
}
