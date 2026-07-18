import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const payload = await requirePermission('member.activity.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const uid = parseInt(id, 10);
  if (isNaN(uid)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const sp       = req.nextUrl.searchParams;
  const page     = Math.max(1, parseInt(sp.get('page')  ?? '1',  10));
  const limit    = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50', 10)));
  const offset   = (page - 1) * limit;
  const category = sp.get('category') ?? '';
  const search   = sp.get('search')   ?? '';
  const dateFrom = sp.get('date_from') ?? '';
  const dateTo   = sp.get('date_to')   ?? '';

  // Build WHERE clause
  const where:   string[] = ['member_id = $1'];
  const values:  unknown[] = [uid];
  let   pidx = 2;

  if (category && category !== 'ALL') {
    where.push(`category = $${pidx++}`);
    values.push(category);
  }
  if (search) {
    where.push(
      `(activity_id ILIKE $${pidx} OR title ILIKE $${pidx} OR description ILIKE $${pidx} OR remark ILIKE $${pidx} OR reference_id::text ILIKE $${pidx})`
    );
    values.push(`%${search}%`);
    pidx++;
  }
  if (dateFrom) {
    where.push(`created_at >= $${pidx++}::date`);
    values.push(dateFrom);
  }
  if (dateTo) {
    where.push(`created_at < ($${pidx++}::date + interval '1 day')`);
    values.push(dateTo);
  }

  const whereStr = where.join(' AND ');

  // Activity summary from existing data sources (works even with empty activity_log table)
  const [activityRows, countRes, summaryDeposit, summaryWithdrawal, summaryWallet] = await Promise.all([
    pool.query(
      `SELECT id, activity_id, member_id, category, action, title, description,
              amount, balance_before, balance_after,
              reference_type, reference_id,
              operator_type, operator_id, operator_name,
              source, level, ip_address, device, remark, metadata, created_at
       FROM member_activity_logs
       WHERE ${whereStr}
       ORDER BY created_at DESC
       LIMIT $${pidx} OFFSET $${pidx + 1}`,
      [...values, limit, offset],
    ),
    pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM member_activity_logs WHERE ${whereStr}`,
      values,
    ),
    // Last approved deposit
    pool.query<{ deposit_amount: string; created_at: string }>(
      `SELECT deposit_amount, created_at FROM deposit_requests
       WHERE user_id = $1 AND status = 'APPROVED'
       ORDER BY created_at DESC LIMIT 1`,
      [uid],
    ),
    // Last paid withdrawal
    pool.query<{ withdraw_amount: string; created_at: string }>(
      `SELECT withdraw_amount, created_at FROM withdrawal_requests
       WHERE user_id = $1 AND status IN ('PAID','APPROVED')
       ORDER BY created_at DESC LIMIT 1`,
      [uid],
    ),
    // Last wallet adjustment (not PAYMENT_GATEWAY which is equivalent to deposit)
    pool.query<{ type: string; direction: string; amount: string; created_at: string }>(
      `SELECT type, direction, amount, created_at FROM wallet_transactions
       WHERE user_id = $1 AND type NOT IN ('PAYMENT_GATEWAY')
       ORDER BY created_at DESC LIMIT 1`,
      [uid],
    ),
  ]);

  // Activity log summary (from activity_logs table)
  const [actLastLogin, actLastTelegram, actLastBonus, actTotalCount] = await Promise.all([
    pool.query<{ created_at: string }>(
      `SELECT created_at FROM member_activity_logs
       WHERE member_id = $1 AND action = 'Login'
       ORDER BY created_at DESC LIMIT 1`,
      [uid],
    ),
    pool.query<{ created_at: string }>(
      `SELECT created_at FROM member_activity_logs
       WHERE member_id = $1 AND category = 'TELEGRAM'
       ORDER BY created_at DESC LIMIT 1`,
      [uid],
    ),
    pool.query<{ amount: string; created_at: string }>(
      `SELECT amount, created_at FROM member_activity_logs
       WHERE member_id = $1 AND category = 'PROMOTION'
       ORDER BY created_at DESC LIMIT 1`,
      [uid],
    ),
    pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM member_activity_logs WHERE member_id = $1`,
      [uid],
    ),
  ]);

  const lastDeposit    = summaryDeposit.rows[0]    ?? null;
  const lastWithdrawal = summaryWithdrawal.rows[0] ?? null;
  const lastWalletAdj  = summaryWallet.rows[0]     ?? null;

  const summary = {
    last_login_at:          actLastLogin.rows[0]?.created_at ?? null,
    last_deposit:           lastDeposit
                              ? { amount: lastDeposit.deposit_amount, at: lastDeposit.created_at }
                              : null,
    last_withdrawal:        lastWithdrawal
                              ? { amount: lastWithdrawal.withdraw_amount, at: lastWithdrawal.created_at }
                              : null,
    last_bonus:             actLastBonus.rows[0]
                              ? { amount: actLastBonus.rows[0].amount, at: actLastBonus.rows[0].created_at }
                              : null,
    last_wallet_adjustment: lastWalletAdj
                              ? {
                                  type:      lastWalletAdj.type,
                                  direction: lastWalletAdj.direction,
                                  amount:    lastWalletAdj.amount,
                                  at:        lastWalletAdj.created_at,
                                }
                              : null,
    last_telegram_binding_at: actLastTelegram.rows[0]?.created_at ?? null,
    total_activity_count:   actTotalCount.rows[0]?.total ?? 0,
  };

  return NextResponse.json({
    data:    activityRows.rows,
    total:   countRes.rows[0]?.total ?? 0,
    page,
    limit,
    summary,
  });
}
