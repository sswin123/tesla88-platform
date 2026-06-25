import pool from '@/lib/db';
import type { AuditLog } from '@/lib/types';

export async function logAudit(data: {
  admin_id: number;
  action: string;
  target_type: string;
  target_id?: number | null;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO audit_logs (admin_id, action, target_type, target_id, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      data.admin_id,
      data.action,
      data.target_type,
      data.target_id ?? null,
      data.old_value ? JSON.stringify(data.old_value) : null,
      data.new_value ? JSON.stringify(data.new_value) : null,
    ]
  );
}

export async function getAuditLogs(opts: {
  limit?: number;
  offset?: number;
  target_type?: string;
}): Promise<{ data: AuditLog[]; total: number }> {
  const limit  = opts.limit  ?? 50;
  const offset = opts.offset ?? 0;

  const whereClause = opts.target_type ? 'WHERE al.target_type = $3' : '';
  const params: unknown[] = opts.target_type
    ? [limit, offset, opts.target_type]
    : [limit, offset];

  const countParam = opts.target_type ? '$1' : '';
  const countWhere = opts.target_type ? `WHERE target_type = ${countParam}` : '';
  const countParams: unknown[] = opts.target_type ? [opts.target_type] : [];

  const [rows, count] = await Promise.all([
    pool.query<AuditLog>(
      `SELECT al.*, a.erp_username AS admin_username
       FROM audit_logs al
       JOIN admins a ON a.id = al.admin_id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
      params
    ),
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM audit_logs ${countWhere}`,
      countParams
    ),
  ]);

  return { data: rows.rows, total: count.rows[0].count };
}
