import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

export async function GET() {
  const payload = await requirePermission('livechat.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows } = await pool.query<{ count: number }>(
    `SELECT COALESCE(SUM(erp_unread_count), 0)::int AS count
     FROM support_sessions WHERE status != 'CLOSED'`
  );
  return NextResponse.json({ count: rows[0]?.count ?? 0 });
}
