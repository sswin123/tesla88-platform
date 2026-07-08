import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

export async function GET(request: NextRequest) {
  if (!await requirePermission('members.view')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = request.nextUrl;
  const search = searchParams.get('search')?.trim() ?? '';
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit  = 20;
  const offset = (page - 1) * limit;

  if (search) {
    const pattern = `%${search}%`;
    const [rows, count] = await Promise.all([
      pool.query(
        `SELECT id, telegram_id, telegram_username, first_name, phone, status, created_at
         FROM users
         WHERE id::text ILIKE $1 OR phone ILIKE $1 OR first_name ILIKE $1 OR telegram_username ILIKE $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [pattern, limit, offset]
      ),
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM users
         WHERE id::text ILIKE $1 OR phone ILIKE $1 OR first_name ILIKE $1 OR telegram_username ILIKE $1`,
        [pattern]
      ),
    ]);
    return NextResponse.json({ data: rows.rows, total: count.rows[0].count, page, limit });
  }

  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT id, telegram_id, telegram_username, first_name, phone, status, created_at
       FROM users
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    pool.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM users'),
  ]);
  return NextResponse.json({ data: rows.rows, total: count.rows[0].count, page, limit });
}
