import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status')?.trim() ?? '';
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit  = 20;
  const offset = (page - 1) * limit;

  const baseJoin = `
    FROM withdrawal_requests wr
    JOIN users u ON u.id = wr.user_id
  `;

  if (status) {
    const [rows, count] = await Promise.all([
      pool.query(
        `SELECT wr.id, wr.user_id, wr.provider, wr.game_username,
                wr.withdraw_amount, wr.bank_name, wr.bank_account, wr.bank_holder_name,
                wr.status, wr.created_at, wr.reviewed_at,
                u.first_name, u.phone
         ${baseJoin}
         WHERE wr.status = $1
         ORDER BY wr.created_at DESC
         LIMIT $2 OFFSET $3`,
        [status, limit, offset]
      ),
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count ${baseJoin} WHERE wr.status = $1`,
        [status]
      ),
    ]);
    return NextResponse.json({ data: rows.rows, total: count.rows[0].count, page, limit });
  }

  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT wr.id, wr.user_id, wr.provider, wr.game_username,
              wr.withdraw_amount, wr.bank_name, wr.bank_account, wr.bank_holder_name,
              wr.status, wr.created_at, wr.reviewed_at,
              u.first_name, u.phone
       ${baseJoin}
       ORDER BY wr.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    pool.query<{ count: number }>(`SELECT COUNT(*)::int AS count ${baseJoin}`),
  ]);
  return NextResponse.json({ data: rows.rows, total: count.rows[0].count, page, limit });
}
