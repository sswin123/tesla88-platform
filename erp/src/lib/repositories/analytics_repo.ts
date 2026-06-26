import pool from '@/lib/db';
import type { MemberAnalytics } from '@/lib/types';

export async function getMemberAnalytics(): Promise<MemberAnalytics> {
  const [
    totalRow,
    activeRow,
    depositRateRow,
    retentionRow,
    dailyRows,
    topDepositorsRows,
    topBonusRows,
    referralRow,
    promotionRows,
  ] = await Promise.all([
    // Total members
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM users`
    ),

    // Active in last 30 days
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM users WHERE last_seen_at >= NOW() - INTERVAL '30 days'`
    ),

    // First deposit rate
    pool.query<{ depositors: number; total: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE dep_count > 0)::int AS depositors,
         COUNT(*)::int AS total
       FROM (
         SELECT u.id, COUNT(dr.id) AS dep_count
         FROM users u
         LEFT JOIN deposit_requests dr ON dr.user_id = u.id AND dr.status = 'APPROVED'
         GROUP BY u.id
       ) sub`
    ),

    // Retention rate (30d)
    pool.query<{ retained: number; eligible: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE last_seen_at >= NOW() - INTERVAL '30 days' AND created_at < NOW() - INTERVAL '30 days')::int AS retained,
         COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '30 days')::int AS eligible
       FROM users`
    ),

    // New members per day (last 30 days)
    pool.query<{ date: string; count: number }>(
      `SELECT DATE(created_at) AS date, COUNT(*)::int AS count
       FROM users
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at) ORDER BY DATE(created_at)`
    ),

    // Top 10 depositors
    pool.query<{ id: number; first_name: string; total: number; count: number }>(
      `SELECT u.first_name, u.id, SUM(dr.deposit_amount)::float AS total, COUNT(dr.id)::int AS count
       FROM deposit_requests dr JOIN users u ON u.id = dr.user_id
       WHERE dr.status = 'APPROVED'
       GROUP BY u.id, u.first_name ORDER BY total DESC LIMIT 10`
    ),

    // Top 10 bonus users
    pool.query<{ id: number; first_name: string; total: number; claims: number }>(
      `SELECT u.first_name, u.id, SUM(bc.bonus_amount)::float AS total, COUNT(bc.id)::int AS claims
       FROM bonus_claims bc JOIN users u ON u.id = bc.user_id
       WHERE bc.status != 'CANCELLED'
       GROUP BY u.id, u.first_name ORDER BY total DESC LIMIT 10`
    ),

    // Referral stats
    pool.query<{ referred_members: number; organic_members: number; active_referrers: number }>(
      `SELECT COUNT(*) FILTER (WHERE referred_by IS NOT NULL)::int AS referred_members,
              COUNT(*) FILTER (WHERE referred_by IS NULL)::int AS organic_members,
              COUNT(DISTINCT referred_by) FILTER (WHERE referred_by IS NOT NULL)::int AS active_referrers
       FROM users`
    ),

    // Top promotions by member acquisition
    pool.query<{ name: string; member_count: number }>(
      `SELECT p.name, COUNT(DISTINCT dr.user_id)::int AS member_count
       FROM deposit_requests dr
       JOIN bonus_claims bc ON bc.user_id = dr.user_id
       JOIN promotions p ON p.id = bc.promotion_id
       WHERE dr.status = 'APPROVED'
       GROUP BY p.id, p.name ORDER BY member_count DESC LIMIT 10`
    ),
  ]);

  const dr = depositRateRow.rows[0];
  const rr = retentionRow.rows[0];

  const firstDepositRate =
    dr.total > 0 ? (dr.depositors / dr.total) * 100 : 0;

  const retentionRate30d =
    rr.eligible > 0 ? (rr.retained / rr.eligible) * 100 : 0;

  return {
    total_members: totalRow.rows[0].count,
    active_30d: activeRow.rows[0].count,
    first_deposit_rate: firstDepositRate,
    retention_rate_30d: retentionRate30d,
    new_members_daily: dailyRows.rows.map((r) => ({
      date: typeof r.date === 'string' ? r.date : new Date(r.date).toISOString().split('T')[0],
      count: r.count,
    })),
    top_depositors: topDepositorsRows.rows,
    top_bonus_users: topBonusRows.rows,
    referral_stats: referralRow.rows[0],
    top_promotions_by_members: promotionRows.rows,
  };
}
