import pool from '@/lib/db';
import type { FinanceReport } from '@/lib/types';

export async function getFinanceReport(startDate: string, endDate: string): Promise<FinanceReport> {
  const [depRow, withRow, bonusRow, countRow, firstRepeatRow, vipRow, dailyRows] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(deposit_amount),0)::float AS total, COUNT(*)::int AS count,
              COALESCE(AVG(deposit_amount),0)::float AS avg
       FROM deposit_requests
       WHERE status='APPROVED' AND reviewed_at::date BETWEEN $1 AND $2`,
      [startDate, endDate]
    ),
    pool.query(
      `SELECT COALESCE(SUM(withdraw_amount),0)::float AS total, COUNT(*)::int AS count,
              COALESCE(AVG(withdraw_amount),0)::float AS avg
       FROM withdrawal_requests
       WHERE status='PAID' AND reviewed_at::date BETWEEN $1 AND $2`,
      [startDate, endDate]
    ),
    pool.query(
      `SELECT COALESCE(SUM(bonus_amount),0)::float AS total
       FROM bonus_claims
       WHERE status != 'CANCELLED' AND claimed_at::date BETWEEN $1 AND $2`,
      [startDate, endDate]
    ),
    pool.query(
      `SELECT COUNT(DISTINCT user_id)::int AS depositors
       FROM deposit_requests
       WHERE status='APPROVED' AND reviewed_at::date BETWEEN $1 AND $2`,
      [startDate, endDate]
    ),
    pool.query(
      `SELECT
         SUM(CASE WHEN dep_count = 1 THEN 1 ELSE 0 END)::int AS first_count,
         SUM(CASE WHEN dep_count > 1 THEN 1 ELSE 0 END)::int AS repeat_count
       FROM (
         SELECT user_id, COUNT(*)::int AS dep_count
         FROM deposit_requests
         WHERE status='APPROVED' AND reviewed_at::date BETWEEN $1 AND $2
         GROUP BY user_id
       ) sub`,
      [startDate, endDate]
    ),
    pool.query(
      `SELECT COALESCE(SUM(dr.deposit_amount),0)::float AS total
       FROM deposit_requests dr
       JOIN user_tag_assignments uta ON uta.user_id = dr.user_id
       JOIN customer_tags ct ON ct.id = uta.tag_id AND ct.name = 'VIP'
       WHERE dr.status='APPROVED' AND dr.reviewed_at::date BETWEEN $1 AND $2`,
      [startDate, endDate]
    ),
    pool.query(
      `SELECT
         d::date AS date,
         COALESCE(dep.amount,0)::float AS deposit,
         COALESCE(wit.amount,0)::float AS withdrawal,
         COALESCE(bon.amount,0)::float AS bonus
       FROM generate_series($1::date, $2::date, '1 day'::interval) d
       LEFT JOIN (
         SELECT reviewed_at::date AS d, SUM(deposit_amount) AS amount
         FROM deposit_requests WHERE status='APPROVED' GROUP BY reviewed_at::date
       ) dep ON dep.d = d::date
       LEFT JOIN (
         SELECT reviewed_at::date AS d, SUM(withdraw_amount) AS amount
         FROM withdrawal_requests WHERE status='PAID' GROUP BY reviewed_at::date
       ) wit ON wit.d = d::date
       LEFT JOIN (
         SELECT claimed_at::date AS d, SUM(bonus_amount) AS amount
         FROM bonus_claims WHERE status != 'CANCELLED' GROUP BY claimed_at::date
       ) bon ON bon.d = d::date
       ORDER BY d::date`,
      [startDate, endDate]
    ),
  ]);

  const dep = depRow.rows[0];
  const wit = withRow.rows[0];
  const bon = bonusRow.rows[0];
  const fr = firstRepeatRow.rows[0];
  const netDeposit = dep.total - wit.total;
  const grossProfit = netDeposit - bon.total;

  // countRow is declared but only used to verify depositors shape — not needed in return
  void countRow;

  return {
    period_start: startDate,
    period_end: endDate,
    total_deposit: dep.total,
    total_withdrawal: wit.total,
    total_bonus: bon.total,
    net_deposit: netDeposit,
    gross_profit: grossProfit,
    deposit_count: dep.count,
    withdrawal_count: wit.count,
    avg_deposit: dep.avg,
    avg_withdrawal: wit.avg,
    first_deposit_count: fr.first_count ?? 0,
    repeat_deposit_count: fr.repeat_count ?? 0,
    vip_deposit_amount: vipRow.rows[0].total,
    daily_breakdown: dailyRows.rows.map((r) => ({
      date: r.date,
      deposit: r.deposit,
      withdrawal: r.withdrawal,
      bonus: r.bonus,
      net: r.deposit - r.withdrawal,
    })),
  };
}
