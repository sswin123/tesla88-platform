import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import type { DashboardStats } from '@/lib/types';

export async function GET() {
  const client = await pool.connect();
  try {
    const [tm, am, td, tw, pd, pw,
           todayDep, todayWith,
           depChart, withChart,
           topPromo, topDep,
           todayBonus, newMembers, activeToday, onlineStaff,
           topProviders, monthlyDep, monthlyWith] = await Promise.all([
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

      // Top 10 promotions by claim count (extended from 5)
      client.query<{ name: string; claim_count: number }>(
        `SELECT p.name, COUNT(bc.id)::int AS claim_count
         FROM bonus_claims bc
         JOIN promotions p ON p.id = bc.promotion_id
         WHERE bc.claimed_at >= NOW() - INTERVAL '30 days'
         GROUP BY p.id, p.name
         ORDER BY claim_count DESC
         LIMIT 10`
      ),
      // Top 10 depositors by total amount (extended from 5)
      client.query<{ first_name: string; total: number }>(
        `SELECT u.first_name, COALESCE(SUM(dr.deposit_amount),0)::float AS total
         FROM deposit_requests dr
         JOIN users u ON u.id = dr.user_id
         WHERE dr.status = 'APPROVED'
         GROUP BY u.id, u.first_name
         ORDER BY total DESC
         LIMIT 10`
      ),

      // Today's bonus (claimed today, any status except CANCELLED)
      client.query<{ amount: number }>(
        `SELECT COALESCE(SUM(bonus_amount),0)::float AS amount
         FROM bonus_claims
         WHERE claimed_at >= CURRENT_DATE AND status != 'CANCELLED'`
      ),

      // New members today
      client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM users WHERE created_at >= CURRENT_DATE`
      ),

      // Active members today (last_seen_at = today)
      client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM users WHERE last_seen_at >= CURRENT_DATE`
      ),

      // Online support staff (distinct admins with audit_log action today)
      client.query<{ count: number }>(
        `SELECT COUNT(DISTINCT admin_id)::int AS count FROM audit_logs WHERE created_at >= CURRENT_DATE`
      ),

      // Top 10 game providers (by approved deposit count + amount in last 30 days)
      client.query<{ provider: string; deposit_count: number; deposit_amount: number }>(
        `SELECT provider,
                COUNT(*)::int AS deposit_count,
                COALESCE(SUM(deposit_amount),0)::float AS deposit_amount
         FROM deposit_requests
         WHERE status = 'APPROVED' AND reviewed_at >= NOW() - INTERVAL '30 days'
         GROUP BY provider ORDER BY deposit_count DESC LIMIT 10`
      ),

      // Monthly deposits: last 6 months
      client.query<{ month: string; deposit: number }>(
        `SELECT TO_CHAR(DATE_TRUNC('month', reviewed_at), 'YYYY-MM') AS month,
                COALESCE(SUM(deposit_amount),0)::float AS deposit
         FROM deposit_requests
         WHERE status = 'APPROVED' AND reviewed_at >= NOW() - INTERVAL '6 months'
         GROUP BY DATE_TRUNC('month', reviewed_at)
         ORDER BY DATE_TRUNC('month', reviewed_at)`
      ),

      // Monthly withdrawals: last 6 months
      client.query<{ month: string; withdrawal: number }>(
        `SELECT TO_CHAR(DATE_TRUNC('month', reviewed_at), 'YYYY-MM') AS month,
                COALESCE(SUM(withdraw_amount),0)::float AS withdrawal
         FROM withdrawal_requests
         WHERE status = 'PAID' AND reviewed_at >= NOW() - INTERVAL '6 months'
         GROUP BY DATE_TRUNC('month', reviewed_at)
         ORDER BY DATE_TRUNC('month', reviewed_at)`
      ),
    ]);

    // Merge monthly deposits and withdrawals by month key
    const monthlyMap = new Map<string, { deposit: number; withdrawal: number }>();
    for (const row of monthlyDep.rows) {
      monthlyMap.set(row.month, { deposit: row.deposit, withdrawal: 0 });
    }
    for (const row of monthlyWith.rows) {
      const existing = monthlyMap.get(row.month);
      if (existing) {
        existing.withdrawal = row.withdrawal;
      } else {
        monthlyMap.set(row.month, { deposit: 0, withdrawal: row.withdrawal });
      }
    }
    const monthlyRevenue = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { deposit, withdrawal }]) => ({
        month,
        deposit,
        withdrawal,
        net: deposit - withdrawal,
      }));

    const todayDepositAmount = todayDep.rows[0].amount;
    const todayWithdrawalAmount = todayWith.rows[0].amount;
    const todayBonusAmount = todayBonus.rows[0].amount;

    const stats: DashboardStats = {
      totalMembers:           tm.rows[0].count,
      activeMembers:          am.rows[0].count,
      totalDeposits:          td.rows[0].count,
      totalWithdrawals:       tw.rows[0].count,
      pendingDeposits:        pd.rows[0].count,
      pendingWithdrawals:     pw.rows[0].count,
      todayDepositAmount,
      todayDepositCount:      todayDep.rows[0].count,
      todayWithdrawalAmount,
      todayWithdrawalCount:   todayWith.rows[0].count,
      depositChart:           depChart.rows,
      withdrawalChart:        withChart.rows,
      topPromotions:          topPromo.rows,
      topDepositors:          topDep.rows,
      // NEW fields
      todayBonusAmount,
      todayNetDeposit:        todayDepositAmount - todayWithdrawalAmount,
      todayProfit:            todayDepositAmount - todayWithdrawalAmount - todayBonusAmount,
      newMembersToday:        newMembers.rows[0].count,
      activeMembersToday:     activeToday.rows[0].count,
      onlineSupportStaff:     onlineStaff.rows[0].count,
      topGameProviders:       topProviders.rows,
      monthlyRevenue,
    };

    return NextResponse.json(stats);
  } finally {
    client.release();
  }
}
