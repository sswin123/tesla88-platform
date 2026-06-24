import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status')?.trim() ?? '';
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit  = 20;
  const offset = (page - 1) * limit;

  const baseJoin = `
    FROM deposit_requests dr
    JOIN users u ON u.id = dr.user_id
    LEFT JOIN promotions p ON p.id = dr.promotion_id
  `;

  if (status) {
    const [rows, count] = await Promise.all([
      pool.query(
        `SELECT dr.id, dr.user_id, dr.provider, dr.deposit_amount, dr.bonus_amount,
                dr.credit_amount, dr.status, dr.created_at, dr.reviewed_at,
                u.first_name, u.phone, p.name AS promo_name
         ${baseJoin}
         WHERE dr.status = $1
         ORDER BY dr.created_at DESC
         LIMIT $2 OFFSET $3`,
        [status, limit, offset]
      ),
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count ${baseJoin} WHERE dr.status = $1`,
        [status]
      ),
    ]);
    return NextResponse.json({ data: rows.rows, total: count.rows[0].count, page, limit });
  }

  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT dr.id, dr.user_id, dr.provider, dr.deposit_amount, dr.bonus_amount,
              dr.credit_amount, dr.status, dr.created_at, dr.reviewed_at,
              u.first_name, u.phone, p.name AS promo_name
       ${baseJoin}
       ORDER BY dr.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    pool.query<{ count: number }>(`SELECT COUNT(*)::int AS count ${baseJoin}`),
  ]);
  return NextResponse.json({ data: rows.rows, total: count.rows[0].count, page, limit });
}
