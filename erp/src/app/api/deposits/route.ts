import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

function maskPhone(phone: string): string {
  if (!phone) return phone;
  if (phone.length <= 6) return '*'.repeat(phone.length);
  return phone.slice(0, 4) + '*'.repeat(phone.length - 6) + phone.slice(-2);
}

/** True when postgres error is "column does not exist" (migration not yet applied). */
function isMissingColumnError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as Record<string, unknown>).code === '42703';
}

// ── Column sets ────────────────────────────────────────────────────────────

// New query (migration 027 applied): includes receiving_bank_* columns
const SELECT_COLS_NEW = `
  dr.id, dr.user_id, dr.provider, dr.deposit_amount, dr.bonus_amount,
  dr.credit_amount, dr.payment_bank, dr.status, dr.reject_reason,
  dr.created_at, dr.reviewed_at,
  u.first_name, u.phone, u.public_id,
  p.name AS promo_name,
  dr.receiving_bank_id,
  pb.bank_name      AS receiving_bank_name,
  pb.account_name   AS receiving_bank_account_name,
  pb.account_number AS receiving_bank_account_number
`;

const BASE_JOIN_NEW = `
  FROM deposit_requests dr
  JOIN users u ON u.id = dr.user_id
  LEFT JOIN promotions p ON p.id = dr.promotion_id
  LEFT JOIN payment_banks pb ON pb.id = dr.receiving_bank_id
`;

// Legacy fallback (before migration 027): no receiving_bank_* columns
const SELECT_COLS_OLD = `
  dr.id, dr.user_id, dr.provider, dr.deposit_amount, dr.bonus_amount,
  dr.credit_amount, dr.payment_bank, dr.status, dr.reject_reason,
  dr.created_at, dr.reviewed_at,
  u.first_name, u.phone, u.public_id,
  p.name AS promo_name,
  NULL::integer AS receiving_bank_id,
  NULL::text    AS receiving_bank_name,
  NULL::text    AS receiving_bank_account_name,
  NULL::text    AS receiving_bank_account_number
`;

const BASE_JOIN_OLD = `
  FROM deposit_requests dr
  JOIN users u ON u.id = dr.user_id
  LEFT JOIN promotions p ON p.id = dr.promotion_id
`;

// ── GET ────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!await requirePermission('deposit.view')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const canViewPhone = !!(await requirePermission('member.view_phone'));

  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status')?.trim() ?? '';
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit  = 20;
  const offset = (page - 1) * limit;

  // Try new schema first; fall back to legacy schema if migration 027 not run
  for (const [SELECT_COLS, BASE_JOIN] of [
    [SELECT_COLS_NEW, BASE_JOIN_NEW],
    [SELECT_COLS_OLD, BASE_JOIN_OLD],
  ] as const) {
    try {
      const applyPhoneMask = (r: Record<string, unknown>) =>
        canViewPhone ? r : { ...r, phone: maskPhone((r.phone as string) ?? '') };

      if (status) {
        const [rows, count] = await Promise.all([
          pool.query(
            `SELECT ${SELECT_COLS} ${BASE_JOIN} WHERE dr.status = $1 ORDER BY dr.created_at DESC LIMIT $2 OFFSET $3`,
            [status, limit, offset]
          ),
          pool.query<{ count: number }>(
            `SELECT COUNT(*)::int AS count ${BASE_JOIN} WHERE dr.status = $1`,
            [status]
          ),
        ]);
        return NextResponse.json({ data: rows.rows.map(applyPhoneMask), total: count.rows[0].count, page, limit });
      }

      const [rows, count] = await Promise.all([
        pool.query(
          `SELECT ${SELECT_COLS} ${BASE_JOIN} ORDER BY dr.created_at DESC LIMIT $1 OFFSET $2`,
          [limit, offset]
        ),
        pool.query<{ count: number }>(`SELECT COUNT(*)::int AS count ${BASE_JOIN}`),
      ]);
      return NextResponse.json({ data: rows.rows.map(applyPhoneMask), total: count.rows[0].count, page, limit });

    } catch (err) {
      if (isMissingColumnError(err)) {
        // Migration not applied yet — try legacy schema in next iteration
        console.warn('[deposits] new schema query failed (migration pending), trying legacy schema');
        continue;
      }
      console.error('[deposits] query error:', err);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
  }

  // Both attempts failed — return structured empty response
  console.error('[deposits] both new and legacy queries failed');
  return NextResponse.json({ data: [], total: 0, page, limit });
}
