import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

function isMissingColumnError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as Record<string, unknown>).code === '42703';
}

function maskPhone(phone: string): string {
  if (!phone || phone.length <= 6) return '*'.repeat(phone?.length ?? 4);
  return phone.slice(0, 4) + '*'.repeat(phone.length - 6) + phone.slice(-2);
}

const SELECT_WITH_PROCESSING = `
  SELECT
    'deposit'          AS type,
    dr.id,
    dr.user_id,
    u.first_name,
    u.phone,
    u.public_id,
    dr.deposit_amount  AS amount,
    dr.status,
    dr.reject_reason,
    dr.processing_by,
    dr.processing_at,
    a.erp_username     AS processing_by_name,
    dr.created_at
  FROM deposit_requests dr
  JOIN users u ON u.id = dr.user_id
  LEFT JOIN admins a ON a.id = dr.processing_by

  UNION ALL

  SELECT
    'withdrawal'       AS type,
    wr.id,
    wr.user_id,
    u.first_name,
    u.phone,
    u.public_id,
    wr.withdraw_amount AS amount,
    wr.status,
    wr.reject_reason,
    wr.processing_by,
    wr.processing_at,
    a.erp_username     AS processing_by_name,
    wr.created_at
  FROM withdrawal_requests wr
  JOIN users u ON u.id = wr.user_id
  LEFT JOIN admins a ON a.id = wr.processing_by
`;

const SELECT_NO_PROCESSING = `
  SELECT
    'deposit'            AS type,
    dr.id,
    dr.user_id,
    u.first_name,
    u.phone,
    u.public_id,
    dr.deposit_amount    AS amount,
    dr.status,
    dr.reject_reason,
    NULL::int            AS processing_by,
    NULL::timestamptz    AS processing_at,
    NULL::text           AS processing_by_name,
    dr.created_at
  FROM deposit_requests dr
  JOIN users u ON u.id = dr.user_id

  UNION ALL

  SELECT
    'withdrawal'         AS type,
    wr.id,
    wr.user_id,
    u.first_name,
    u.phone,
    u.public_id,
    wr.withdraw_amount   AS amount,
    wr.status,
    wr.reject_reason,
    NULL::int            AS processing_by,
    NULL::timestamptz    AS processing_at,
    NULL::text           AS processing_by_name,
    wr.created_at
  FROM withdrawal_requests wr
  JOIN users u ON u.id = wr.user_id
`;

// Type-specific sub-queries for filtering by type
const DEPOSIT_ONLY_WITH_PROCESSING = `
  SELECT
    'deposit' AS type, dr.id, dr.user_id, u.first_name, u.phone, u.public_id,
    dr.deposit_amount AS amount, dr.status, dr.reject_reason,
    dr.processing_by, dr.processing_at, a.erp_username AS processing_by_name, dr.created_at
  FROM deposit_requests dr
  JOIN users u ON u.id = dr.user_id
  LEFT JOIN admins a ON a.id = dr.processing_by
`;

const WITHDRAWAL_ONLY_WITH_PROCESSING = `
  SELECT
    'withdrawal' AS type, wr.id, wr.user_id, u.first_name, u.phone, u.public_id,
    wr.withdraw_amount AS amount, wr.status, wr.reject_reason,
    wr.processing_by, wr.processing_at, a.erp_username AS processing_by_name, wr.created_at
  FROM withdrawal_requests wr
  JOIN users u ON u.id = wr.user_id
  LEFT JOIN admins a ON a.id = wr.processing_by
`;

const DEPOSIT_ONLY_NO_PROCESSING = `
  SELECT
    'deposit' AS type, dr.id, dr.user_id, u.first_name, u.phone, u.public_id,
    dr.deposit_amount AS amount, dr.status, dr.reject_reason,
    NULL::int AS processing_by, NULL::timestamptz AS processing_at, NULL::text AS processing_by_name, dr.created_at
  FROM deposit_requests dr
  JOIN users u ON u.id = dr.user_id
`;

const WITHDRAWAL_ONLY_NO_PROCESSING = `
  SELECT
    'withdrawal' AS type, wr.id, wr.user_id, u.first_name, u.phone, u.public_id,
    wr.withdraw_amount AS amount, wr.status, wr.reject_reason,
    NULL::int AS processing_by, NULL::timestamptz AS processing_at, NULL::text AS processing_by_name, wr.created_at
  FROM withdrawal_requests wr
  JOIN users u ON u.id = wr.user_id
`;

export async function GET(request: NextRequest) {
  const depPerm = await requirePermission('deposit.view');
  const wdPerm  = await requirePermission('withdraw.view');
  if (!depPerm && !wdPerm) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const canViewPhone = !!(await requirePermission('member.view_phone'));
  const { searchParams } = request.nextUrl;

  const txType = searchParams.get('type') ?? 'all';   // all | deposit | withdrawal
  const status = searchParams.get('status')?.trim() ?? '';
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit  = 20;
  const offset = (page - 1) * limit;

  // approved/paid virtual status filter
  const statusFilter = status === 'approved_paid' ? `status IN ('APPROVED','PAID')` :
                       status                     ? `status = '${status.replace(/'/g, "''")}'` :
                       '';

  for (const useProcessing of [true, false]) {
    let baseSql: string;
    if (txType === 'deposit') {
      baseSql = useProcessing ? DEPOSIT_ONLY_WITH_PROCESSING : DEPOSIT_ONLY_NO_PROCESSING;
    } else if (txType === 'withdrawal') {
      baseSql = useProcessing ? WITHDRAWAL_ONLY_WITH_PROCESSING : WITHDRAWAL_ONLY_NO_PROCESSING;
    } else {
      baseSql = useProcessing ? SELECT_WITH_PROCESSING : SELECT_NO_PROCESSING;
    }

    const whereClause = statusFilter ? `WHERE ${statusFilter}` : '';

    const dataSql  = `SELECT * FROM (${baseSql}) sub ${whereClause} ORDER BY created_at DESC LIMIT $1 OFFSET $2`;
    const countSql = `SELECT COUNT(*)::int AS count FROM (${baseSql}) sub ${whereClause}`;

    try {
      const [dataRes, countRes] = await Promise.all([
        pool.query(dataSql, [limit, offset]),
        pool.query<{ count: number }>(countSql),
      ]);

      const applyMask = (r: Record<string, unknown>) =>
        canViewPhone ? r : { ...r, phone: maskPhone((r.phone as string) ?? '') };

      return NextResponse.json({
        data:  dataRes.rows.map(applyMask),
        total: countRes.rows[0].count,
        page,
        limit,
      });
    } catch (err) {
      if (isMissingColumnError(err) && useProcessing) continue;
      console.error('[transactions] query error:', err);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
  }

  return NextResponse.json({ data: [], total: 0, page, limit });
}
