import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import pool from '@/lib/db';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows } = await pool.query<{ count: number }>(
    `SELECT COALESCE(SUM(erp_unread_count), 0)::int AS count
     FROM support_sessions WHERE status != 'CLOSED'`
  );
  return NextResponse.json({ count: rows[0]?.count ?? 0 });
}
