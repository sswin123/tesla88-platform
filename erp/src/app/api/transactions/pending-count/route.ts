import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

export const dynamic = 'force-dynamic';

interface PendingRow {
  deposit_count:    number | null;
  withdrawal_count: number | null;
}

/** Returns pending transaction counts split by type.
 *  Requires deposit.view OR withdraw.view permission. */
export async function GET() {
  const [depPerm, wdPerm] = await Promise.all([
    requirePermission('deposit.view'),
    requirePermission('withdraw.view'),
  ]);
  if (!depPerm && !wdPerm) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { rows } = await pool.query<PendingRow>(`
    SELECT
      (SELECT COUNT(*)::int FROM deposit_requests    WHERE status = 'PENDING') AS deposit_count,
      (SELECT COUNT(*)::int FROM withdrawal_requests WHERE status = 'PENDING') AS withdrawal_count
  `);

  const deposit_count    = rows[0]?.deposit_count    ?? 0;
  const withdrawal_count = rows[0]?.withdrawal_count ?? 0;
  const count            = deposit_count + withdrawal_count;

  return NextResponse.json({ count, deposit_count, withdrawal_count });
}
