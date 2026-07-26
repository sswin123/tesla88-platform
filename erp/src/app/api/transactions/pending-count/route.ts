import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

export const dynamic = 'force-dynamic';

interface PendingRow {
  deposit_count:               number | null;
  withdrawal_count:            number | null;
  deposit_processing_count:    number | null;
  withdrawal_processing_count: number | null;
}

/** Returns pending and processing transaction counts split by type.
 *  Requires deposit.view OR withdraw.view permission.
 *
 *  Fields:
 *    count              — PENDING only. Used by the sidebar reminder; must NOT include PROCESSING.
 *    deposit_count      — PENDING deposits.
 *    withdrawal_count   — PENDING withdrawals.
 *    active_count       — PENDING + PROCESSING. Used by the Pending tab display.
 *    deposit_active_count    — PENDING + PROCESSING deposits (for stats cards).
 *    withdrawal_active_count — PENDING + PROCESSING withdrawals (for stats cards).
 */
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
      (SELECT COUNT(*)::int FROM deposit_requests    WHERE status = 'PENDING')    AS deposit_count,
      (SELECT COUNT(*)::int FROM withdrawal_requests WHERE status = 'PENDING')    AS withdrawal_count,
      (SELECT COUNT(*)::int FROM deposit_requests    WHERE status = 'PROCESSING') AS deposit_processing_count,
      (SELECT COUNT(*)::int FROM withdrawal_requests WHERE status = 'PROCESSING') AS withdrawal_processing_count
  `);

  const deposit_count               = rows[0]?.deposit_count               ?? 0;
  const withdrawal_count            = rows[0]?.withdrawal_count            ?? 0;
  const deposit_processing_count    = rows[0]?.deposit_processing_count    ?? 0;
  const withdrawal_processing_count = rows[0]?.withdrawal_processing_count ?? 0;

  // Reminder count — PENDING only (sidebar badge + repeat beep logic)
  const count = deposit_count + withdrawal_count;

  // Display count — PENDING + PROCESSING (Pending tab stats cards)
  const deposit_active_count    = deposit_count    + deposit_processing_count;
  const withdrawal_active_count = withdrawal_count + withdrawal_processing_count;
  const active_count            = deposit_active_count + withdrawal_active_count;

  return NextResponse.json({
    count,
    deposit_count,
    withdrawal_count,
    active_count,
    deposit_active_count,
    withdrawal_active_count,
  });
}
