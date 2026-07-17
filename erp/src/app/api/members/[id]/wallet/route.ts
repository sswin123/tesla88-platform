import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const payload = await requirePermission('member.wallet.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const uid = parseInt(id, 10);
  if (isNaN(uid)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { rows } = await pool.query(
    `SELECT
       u.net_deposit          AS balance,
       u.available_balance,
       u.pending_withdrawal,
       u.total_deposit,
       u.total_withdraw,
       u.total_bonus,
       (SELECT COUNT(*) FROM deposit_requests    WHERE user_id = u.id AND status = 'PENDING')::int AS pending_deposits,
       (SELECT COUNT(*) FROM withdrawal_requests WHERE user_id = u.id AND status = 'PENDING')::int AS pending_withdrawals,
       (SELECT MAX(created_at) FROM wallet_transactions WHERE user_id = u.id) AS last_wallet_update
     FROM users u
     WHERE u.id = $1`,
    [uid],
  );

  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}
