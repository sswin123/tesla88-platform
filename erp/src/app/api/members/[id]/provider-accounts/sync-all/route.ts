// POST /api/members/[id]/provider-accounts/sync-all
// Admin-triggered: pull balances from ALL TRANSFER-wallet providers back to the main wallet.
// Uses Promise.allSettled() — partial provider failure does not block other providers.
// Requires permission: member.provider_account.sync

import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';
import { logAudit } from '@/lib/repositories/audit_repo';
import { createGamingPlatform } from '@/lib/providers';
import { adjustWallet } from '@/lib/services/wallet';
import { TransactionRepository } from '@/lib/providers/repositories/TransactionRepository';
import { ActivityLogService } from '@/lib/services/activity-log';

const txRepo = new TransactionRepository();

type Params = { params: Promise<{ id: string }> };

interface ProviderRow {
  provider_code:     string;
  provider_name:     string;
  provider_login_id: string;
  user_public_id:    string;
  brand_code:        string;
}

export interface SyncAllResult {
  provider_code: string;
  provider_name: string;
  status:        'SUCCESS' | 'FAILED' | 'SKIPPED';
  returned?:     number;
  error?:        string;
}

export async function POST(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('member.provider_account.sync');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const uid = parseInt(id, 10);
  if (isNaN(uid)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // Query all TRANSFER wallet providers this member has accounts for.
  // DISTINCT ON (pa.provider_code) picks one brand per provider (same as single-sync LIMIT 1).
  const { rows: providerRows } = await pool.query<ProviderRow>(
    `SELECT DISTINCT ON (pa.provider_code)
       pa.provider_code,
       gp.display_name       AS provider_name,
       pa.provider_login_id,
       u.public_id           AS user_public_id,
       b.code                AS brand_code
     FROM provider_accounts pa
     JOIN gp_providers     gp ON gp.code        = pa.provider_code
     JOIN users             u  ON u.id           = pa.user_id
     JOIN brand_providers  bp ON bp.provider_id  = gp.id
                              AND bp.status IN ('ACTIVE', 'TESTING')
     JOIN brands            b  ON b.id           = bp.brand_id
     WHERE pa.user_id = $1
       AND gp.wallet_type = 'TRANSFER'
     ORDER BY pa.provider_code, b.code`,
    [uid],
  );

  if (providerRows.length === 0) {
    return NextResponse.json({ results: [], total_returned: 0 });
  }

  // Snapshot balance before any sync starts — used as before_balance in logs.
  const { rows: walletSnap } = await pool.query<{ available_balance: string }>(
    `SELECT available_balance FROM users WHERE id = $1 LIMIT 1`,
    [uid],
  );
  const balanceBefore = parseFloat(walletSnap[0]?.available_balance ?? '0');

  const platform = createGamingPlatform();

  const settled = await Promise.allSettled(
    providerRows.map(async (row): Promise<SyncAllResult> => {
      const { provider_code, provider_name, provider_login_id, user_public_id, brand_code } = row;
      const refId = `${provider_code}WD-SYNCALL-${uid}-${Date.now()}`;

      let adapter;
      try {
        adapter = await platform.brandManager.getAdapter(brand_code, provider_code);
      } catch {
        return { provider_code, provider_name, status: 'FAILED', error: 'Adapter not found' };
      }

      if (!adapter.withdrawAll) {
        return { provider_code, provider_name, status: 'SKIPPED', error: 'Provider does not support wallet sync' };
      }

      let returned = 0;
      try {
        returned = await adapter.withdrawAll(provider_login_id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // error 37123 = "No balance to withdraw" — non-fatal, treat as success with 0
        if (msg.includes('37123')) {
          returned = 0;
        } else {
          console.error(`[provider-accounts/sync-all] withdrawAll failed userId=${uid} provider=${provider_code}:`, msg);

          await txRepo.create({
            provider:       provider_code,
            transaction_id: randomUUID(),
            reference_id:   refId,
            type:           'FUND_RETURN',
            status:         'FAILED',
            user_id:        uid,
            user_public_id,
            amount:         0,
            currency:       'MYR',
            before_balance: balanceBefore,
            after_balance:  balanceBefore,
            error_message:  msg,
            metadata:       { trigger: 'ADMIN_SYNC_ALL', admin_id: payload.sub },
          }).catch(() => undefined);

          return { provider_code, provider_name, status: 'FAILED', error: msg };
        }
      }

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
            gateway:         provider_code,
            referenceNumber: refId,
            remark:          `[${provider_code}] Admin Sync All`,
            operatorAdminId: payload.sub,
          });
          await client.query('COMMIT');
          walletTxId   = wtRow.id;
          balanceAfter = parseFloat(wtRow.balance_after);
        } catch (e) {
          await client.query('ROLLBACK').catch(() => undefined);
          console.error(`[provider-accounts/sync-all] adjustWallet failed userId=${uid} provider=${provider_code}:`, e);
          return { provider_code, provider_name, status: 'FAILED', error: 'Failed to credit wallet' };
        } finally {
          client.release();
        }
      }

      await txRepo.create({
        provider:       provider_code,
        transaction_id: walletTxId ?? randomUUID(),
        reference_id:   refId,
        type:           'FUND_RETURN',
        status:         'SUCCESS',
        user_id:        uid,
        user_public_id,
        amount:         returned,
        currency:       'MYR',
        before_balance: balanceBefore,
        after_balance:  balanceAfter,
        metadata:       { trigger: 'ADMIN_SYNC_ALL', admin_id: payload.sub },
      }).catch(e => console.warn(`[provider-accounts/sync-all] txRepo.create failed:`, e));

      await ActivityLogService.log({
        member_id:      uid,
        category:       'BALANCE',
        action:         'Admin Sync All',
        title:          `${provider_name} — Admin Sync All`,
        description:    returned > 0
          ? `Admin recovered RM ${returned.toFixed(2)} from ${provider_name}`
          : `Admin sync all triggered — no balance in ${provider_name}`,
        amount:         returned > 0 ? returned : null,
        balance_before: balanceBefore,
        balance_after:  balanceAfter,
        reference_type: 'wallet_transaction',
        reference_id:   walletTxId ? parseInt(walletTxId, 10) : null,
        operator_type:  'STAFF',
        operator_id:    payload.sub,
        source:         'ERP',
        level:          'INFO',
        remark:         `[${provider_code}] Admin Sync All — triggered by admin ${payload.sub}`,
        metadata:       { provider_code, returned, ref_id: refId },
      });

      return { provider_code, provider_name, status: 'SUCCESS', returned };
    }),
  );

  // Unwrap settled results — fulfilled = task returned a SyncAllResult; rejected = unexpected throw.
  const results: SyncAllResult[] = settled.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const row = providerRows[i]!;
    return {
      provider_code: row.provider_code,
      provider_name: row.provider_name,
      status:        'FAILED',
      error:         r.reason instanceof Error ? r.reason.message : String(r.reason),
    };
  });

  const totalReturned = results.reduce((sum, r) => sum + (r.returned ?? 0), 0);

  await logAudit({
    admin_id:    payload.sub,
    action:      'MEMBER_PROVIDER_SYNC_ALL',
    target_type: 'member',
    target_id:   uid,
    old_value:   { providers: providerRows.map(r => r.provider_code), balance_before: balanceBefore },
    new_value:   { results, total_returned: totalReturned },
  });

  return NextResponse.json({ results, total_returned: totalReturned });
}
