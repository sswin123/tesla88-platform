import pool from '@/lib/db';
import type { RiskScanResult, RiskFlag } from '@/lib/types';

function parsePgArray(val: unknown): number[] {
  if (!val) return [];
  const s = String(val).replace(/^\{|\}$/g, '');
  return s ? s.split(',').map(Number) : [];
}

function parsePgTextArray(val: unknown): string[] {
  if (!val) return [];
  const s = String(val).replace(/^\{|\}$/g, '');
  return s ? s.split(',') : [];
}

export async function scanRisks(): Promise<RiskScanResult> {
  const [dupPhones, dupBanks, bonusRatio, freqWithdrawals, rapidPattern] = await Promise.all([
    // Duplicate phone
    pool.query(`
      SELECT u.phone, COUNT(*)::int AS user_count, array_agg(u.id) AS user_ids, array_agg(u.first_name) AS names
      FROM users u
      WHERE u.phone IS NOT NULL AND u.phone != ''
      GROUP BY u.phone HAVING COUNT(*) > 1
      ORDER BY user_count DESC LIMIT 20
    `),
    // Duplicate bank account
    pool.query(`
      SELECT u.bank_account, u.bank_name, COUNT(*)::int AS user_count, array_agg(u.id) AS user_ids, array_agg(u.first_name) AS names
      FROM users u
      WHERE u.bank_account IS NOT NULL AND u.bank_account != ''
      GROUP BY u.bank_account, u.bank_name HAVING COUNT(*) > 1
      ORDER BY user_count DESC LIMIT 20
    `),
    // High bonus ratio (bonus/deposit > 50% in last 30 days)
    pool.query(`
      SELECT u.id, u.first_name,
             COALESCE(SUM(dr.deposit_amount),0)::float AS total_dep,
             COALESCE(SUM(bc.bonus_amount),0)::float AS total_bonus,
             CASE WHEN COALESCE(SUM(dr.deposit_amount),0) > 0
                  THEN (COALESCE(SUM(bc.bonus_amount),0) / SUM(dr.deposit_amount) * 100)::float
                  ELSE 0 END AS bonus_ratio
      FROM users u
      LEFT JOIN deposit_requests dr ON dr.user_id = u.id AND dr.status = 'APPROVED' AND dr.reviewed_at >= NOW() - INTERVAL '30 days'
      LEFT JOIN bonus_claims bc ON bc.user_id = u.id AND bc.status != 'CANCELLED' AND bc.claimed_at >= NOW() - INTERVAL '30 days'
      GROUP BY u.id, u.first_name
      HAVING COALESCE(SUM(dr.deposit_amount),0) > 0 AND
             (COALESCE(SUM(bc.bonus_amount),0) / SUM(dr.deposit_amount)) > 0.5
      ORDER BY bonus_ratio DESC LIMIT 20
    `),
    // Frequent withdrawals (>3 in 7 days)
    pool.query(`
      SELECT u.id, u.first_name, COUNT(*)::int AS withdrawal_count
      FROM withdrawal_requests wr JOIN users u ON u.id = wr.user_id
      WHERE wr.created_at >= NOW() - INTERVAL '7 days' AND wr.status != 'REJECTED'
      GROUP BY u.id, u.first_name HAVING COUNT(*) > 3
      ORDER BY withdrawal_count DESC LIMIT 20
    `),
    // Rapid deposit/withdraw pattern (deposit then withdrawal within 24h, last 30 days)
    pool.query(`
      SELECT u.id, u.first_name, COUNT(DISTINCT dr.id)::int AS rapid_count
      FROM deposit_requests dr
      JOIN withdrawal_requests wr ON wr.user_id = dr.user_id
        AND wr.created_at BETWEEN dr.reviewed_at AND dr.reviewed_at + INTERVAL '24 hours'
      JOIN users u ON u.id = dr.user_id
      WHERE dr.status='APPROVED' AND wr.status != 'REJECTED'
        AND dr.reviewed_at >= NOW() - INTERVAL '30 days'
      GROUP BY u.id, u.first_name HAVING COUNT(DISTINCT dr.id) >= 2
      ORDER BY rapid_count DESC LIMIT 20
    `),
  ]);

  return {
    duplicate_phones: dupPhones.rows.map((r) => ({
      phone: r.phone,
      user_count: r.user_count,
      user_ids: parsePgArray(r.user_ids),
      names: parsePgTextArray(r.names),
    })),
    duplicate_banks: dupBanks.rows.map((r) => ({
      bank_account: r.bank_account,
      bank_name: r.bank_name,
      user_count: r.user_count,
      user_ids: parsePgArray(r.user_ids),
      names: parsePgTextArray(r.names),
    })),
    high_bonus_ratio: bonusRatio.rows.map((r) => ({
      id: r.id,
      first_name: r.first_name,
      total_dep: Number(r.total_dep),
      total_bonus: Number(r.total_bonus),
      bonus_ratio: Number(r.bonus_ratio),
    })),
    frequent_withdrawals: freqWithdrawals.rows.map((r) => ({
      id: r.id,
      first_name: r.first_name,
      withdrawal_count: r.withdrawal_count,
    })),
    rapid_pattern: rapidPattern.rows.map((r) => ({
      id: r.id,
      first_name: r.first_name,
      rapid_count: r.rapid_count,
    })),
  };
}

export async function getRiskFlags(status?: string): Promise<RiskFlag[]> {
  const params: unknown[] = [];
  const where = status ? (params.push(status), `WHERE rf.status = $1`) : '';

  const { rows } = await pool.query<RiskFlag>(
    `SELECT rf.id, rf.user_id, u.first_name AS user_name,
            rf.risk_type, rf.severity, rf.status,
            rf.note, rf.flagged_by, rf.reviewed_by,
            rf.created_at, rf.updated_at
     FROM risk_flags rf
     JOIN users u ON u.id = rf.user_id
     ${where}
     ORDER BY rf.created_at DESC`,
    params
  );
  return rows;
}

export async function createRiskFlag(data: {
  user_id: number;
  risk_type: string;
  severity: string;
  note?: string;
  flagged_by: string;
}): Promise<RiskFlag> {
  const { rows } = await pool.query<RiskFlag>(
    `INSERT INTO risk_flags (user_id, risk_type, severity, note, flagged_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [data.user_id, data.risk_type, data.severity ?? 'MEDIUM', data.note ?? null, data.flagged_by]
  );
  return rows[0];
}

export async function updateRiskFlag(
  id: number,
  data: { status: string; reviewed_by: string; note?: string }
): Promise<RiskFlag | null> {
  const { rows } = await pool.query<RiskFlag>(
    `UPDATE risk_flags
     SET status = $2, reviewed_by = $3, note = COALESCE($4, note), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, data.status, data.reviewed_by, data.note ?? null]
  );
  return rows[0] ?? null;
}
