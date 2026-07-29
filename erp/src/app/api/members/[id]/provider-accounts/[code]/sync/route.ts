// POST /api/members/[id]/provider-accounts/[code]/sync
// Admin-triggered: pull any remaining balance from a TRANSFER-wallet provider
// back to the member's main wallet.
// Requires permission: member.provider_account.sync
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';
import { logAudit } from '@/lib/repositories/audit_repo';
import { createGamingPlatform } from '@/lib/providers';
import type { MegaAppAdapter } from '@/lib/providers/adapters/megaapp/MegaAppAdapter';
import { adjustWallet } from '@/lib/services/wallet';

const SYSTEM_ADMIN_ID = parseInt(process.env.GAME_SYSTEM_ADMIN_ID ?? '1', 10);

type Params = { params: Promise<{ id: string; code: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('member.provider_account.sync');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, code } = await params;
  const uid = parseInt(id, 10);
  if (isNaN(uid)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const upperCode = code.toUpperCase();

  // Get the player's provider account
  const { rows: paRows } = await pool.query<{
    provider_login_id: string;
    provider_code: string;
  }>(
    `SELECT provider_login_id, provider_code
     FROM provider_accounts
     WHERE user_id = $1 AND provider_code = $2 LIMIT 1`,
    [uid, upperCode],
  );

  const pa = paRows[0];
  if (!pa) {
    return NextResponse.json({ error: `No ${upperCode} account found for this member` }, { status: 404 });
  }

  // Verify it's a TRANSFER wallet provider
  const { rows: provRows } = await pool.query<{ wallet_type: string; code: string }>(
    `SELECT gp.wallet_type, gp.code
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

  // Read current wallet balance before sync
  const { rows: walletBefore } = await pool.query<{ available_balance: string }>(
    `SELECT available_balance FROM users WHERE id = $1 LIMIT 1`,
    [uid],
  );
  const balanceBefore = parseFloat(walletBefore[0]?.available_balance ?? '0');

  // Pull MEGA balance back to main wallet
  let returned = 0;
  try {
    returned = await adapter.autoWithdrawAll(loginId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // error 37123 = "No balance to withdraw" — non-fatal
    if (!msg.includes('37123')) {
      console.error(`[provider-accounts/sync] autoWithdrawAll failed userId=${uid}:`, msg);
      return NextResponse.json({ error: `Sync failed: ${msg}` }, { status: 502 });
    }
  }

  // Credit returned amount via adjustWallet (writes wallet_transactions record)
  let balanceAfter = balanceBefore;
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
        referenceNumber: `${upperCode}WD-ADMIN-${uid}-${Date.now()}`,
        remark:          `[${upperCode}] Admin Sync — transfer out from provider`,
        operatorAdminId: payload.sub, // admin who triggered the sync
      });
      await client.query('COMMIT');
      balanceAfter = parseFloat(wtRow.balance_after);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error(`[provider-accounts/sync] adjustWallet failed userId=${uid}:`, e);
      return NextResponse.json({ error: 'Failed to credit wallet' }, { status: 500 });
    } finally {
      client.release();
    }
  }

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
    returned:       returned,
    balance_before: balanceBefore,
    balance_after:  balanceAfter,
  });
}
