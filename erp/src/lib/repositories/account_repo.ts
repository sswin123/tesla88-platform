import pool from '@/lib/db';
import type { AccountPoolRow, AccountStats } from '@/lib/types';

export async function getAccountStats(): Promise<AccountStats> {
  const [totalRow, byProviderRows] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'AVAILABLE')::int AS available,
        COUNT(*) FILTER (WHERE status = 'ASSIGNED')::int  AS assigned,
        COUNT(*) FILTER (WHERE status = 'DISABLED')::int  AS disabled
      FROM account_pool
    `),
    pool.query(`
      SELECT provider,
        COUNT(*) FILTER (WHERE status = 'AVAILABLE')::int AS available,
        COUNT(*) FILTER (WHERE status = 'ASSIGNED')::int  AS assigned,
        COUNT(*) FILTER (WHERE status = 'DISABLED')::int  AS disabled
      FROM account_pool
      GROUP BY provider ORDER BY provider
    `),
  ]);
  return {
    total:       totalRow.rows[0].total,
    available:   totalRow.rows[0].available,
    assigned:    totalRow.rows[0].assigned,
    disabled:    totalRow.rows[0].disabled,
    by_provider: byProviderRows.rows,
  };
}

export async function getAccounts(opts: {
  provider?: string;
  status?: string;
  search?: string;
  limit: number;
  offset: number;
}): Promise<{ accounts: AccountPoolRow[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (opts.provider) {
    conditions.push(`ap.provider = $${i++}`);
    params.push(opts.provider);
  }
  if (opts.status) {
    conditions.push(`ap.status = $${i++}`);
    params.push(opts.status);
  }
  if (opts.search) {
    conditions.push(
      `(ap.username ILIKE $${i} OR ap.provider ILIKE $${i} OR u.first_name ILIKE $${i})`
    );
    params.push(`%${opts.search}%`);
    i++;
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows, countRow] = await Promise.all([
    pool.query(
      `SELECT ap.id, ap.provider, ap.username, ap.status,
              ap.assigned_user_id, u.first_name AS assigned_user_name,
              ap.note, ap.created_at::text
       FROM account_pool ap
       LEFT JOIN users u ON u.id = ap.assigned_user_id
       ${where}
       ORDER BY ap.provider, ap.username
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, opts.limit, opts.offset]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM account_pool ap
       LEFT JOIN users u ON u.id = ap.assigned_user_id
       ${where}`,
      params
    ),
  ]);

  const accounts: AccountPoolRow[] = rows.rows.map((r) => ({
    ...r,
    assigned_at: null, // column may not exist; set to null
  }));

  return { accounts, total: countRow.rows[0].count };
}

export async function reassignAccount(
  accountId: number,
  newUserId: number | null,
  _assignedBy: string
): Promise<void> {
  const newStatus = newUserId === null ? 'AVAILABLE' : 'ASSIGNED';
  await pool.query(
    `UPDATE account_pool SET assigned_user_id = $2, status = $3 WHERE id = $1`,
    [accountId, newUserId, newStatus]
  );
}

export async function updateAccountStatus(
  accountId: number,
  status: string
): Promise<void> {
  await pool.query(
    `UPDATE account_pool SET status = $2 WHERE id = $1`,
    [accountId, status]
  );
}

export async function bulkImportAccounts(
  rows: { provider: string; username: string; password: string }[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const providers = rows.map((r) => r.provider);
  const usernames = rows.map((r) => r.username);
  const passwords = rows.map((r) => r.password);
  const result = await pool.query(
    `INSERT INTO account_pool (provider, username, password, status)
     SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], ARRAY_FILL('AVAILABLE'::text, ARRAY[array_length($1::text[], 1)]))
     ON CONFLICT DO NOTHING`,
    [providers, usernames, passwords]
  );
  return result.rowCount ?? 0;
}

export async function getProviders(): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT provider FROM account_pool ORDER BY provider`
  );
  return rows.map((r: { provider: string }) => r.provider);
}
