import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import type { DashboardStats } from '@/lib/types';

export async function GET() {
  const client = await pool.connect();
  try {
    const [tm, am, td, tw, pd, pw,
           todayDep, todayWith,
           depChart, withChart,
           topPromo, topDep] = await Promise.all([
      client.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM users'),
      client.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM users WHERE status = 'ACTIVE'"),
      client.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM deposit_requests WHERE status = 'APPROVED'"),
      client.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM withdrawal_requests WHERE status = 'PAID'"),
      client.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM deposit_requests WHERE status = 'PENDING'"),
      client.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM withdrawal_requests WHERE status = 'PENDING'"),

      // Today's deposits (APPROVED)
      client.query<{ amount: number; count: number }>(
        `SELECT COALESCE(SUM(deposit_amount),0)::float AS amount, COUNT(*)::int AS count
         FROM deposit_requests
         WHERE status = 'APPROVED' AND reviewed_at >= CURRENT_DATE`
      ),
      // Today's withdrawals (PAID)
      client.query<{ amount: number; count: number }>(
        `SELECT COALESCE(SUM(withdraw_amount),0)::float AS amount, COUNT(*)::int AS count
         FROM withdrawal_requests
         WHERE status = 'PAID' AND reviewed_at >= CURRENT_DATE`
      ),

      // 7-day deposit chart
      client.query<{ date: string; amount: number; count: number }>(
        `SELECT TO_CHAR(reviewed_at AT TIME ZONE 'UTC+8', 'MM-DD') AS date,
                COALESCE(SUM(deposit_amount),0)::float AS amount,
                COUNT(*)::int AS count
         FROM deposit_requests
         WHERE status = 'APPROVED'
           AND reviewed_at >= NOW() - INTERVAL '7 days'
         GROUP BY TO_CHAR(reviewed_at AT TIME ZONE 'UTC+8', 'MM-DD')
         ORDER BY MIN(reviewed_at)`
      ),
      // 7-day withdrawal chart
      client.query<{ date: string; amount: number; count: number }>(
        `SELECT TO_CHAR(reviewed_at AT TIME ZONE 'UTC+8', 'MM-DD') AS date,
                COALESCE(SUM(withdraw_amount),0)::float AS amount,
                COUNT(*)::int AS count
         FROM withdrawal_requests
         WHERE status = 'PAID'
           AND reviewed_at >= NOW() - INTERVAL '7 days'
         GROUP BY TO_CHAR(reviewed_at AT TIME ZONE 'UTC+8', 'MM-DD')
         ORDER BY MIN(reviewed_at)`
      ),

      // Top 5 promotions by claim count
      client.query<{ name: string; claim_count: number }>(
        `SELECT p.name, COUNT(bc.id)::int AS claim_count
         FROM bonus_claims bc
         JOIN promotions p ON p.id = bc.promotion_id
         WHERE bc.claimed_at >= NOW() - INTERVAL '30 days'
         GROUP BY p.id, p.name
         ORDER BY claim_count DESC
         LIMIT 5`
      ),
      // Top 5 depositors by total amount (all time)
      client.query<{ first_name: string; total: number }>(
        `SELECT u.first_name, COALESCE(SUM(dr.deposit_amount),0)::float AS total
         FROM deposit_requests dr
         JOIN users u ON u.id = dr.user_id
         WHERE dr.status = 'APPROVED'
         GROUP BY u.id, u.first_name
         ORDER BY total DESC
         LIMIT 5`
      ),
    ]);

    const stats: DashboardStats = {
      totalMembers:           tm.rows[0].count,
      activeMembers:          am.rows[0].count,
      totalDeposits:          td.rows[0].count,
      totalWithdrawals:       tw.rows[0].count,
      pendingDeposits:        pd.rows[0].count,
      pendingWithdrawals:     pw.rows[0].count,
      todayDepositAmount:     todayDep.rows[0].amount,
      todayDepositCount:      todayDep.rows[0].count,
      todayWithdrawalAmount:  todayWith.rows[0].amount,
      todayWithdrawalCount:   todayWith.rows[0].count,
      depositChart:           depChart.rows,
      withdrawalChart:        withChart.rows,
      topPromotions:          topPromo.rows,
      topDepositors:          topDep.rows,
    };

    return NextResponse.json(stats);
  } finally {
    client.release();
  }
}
