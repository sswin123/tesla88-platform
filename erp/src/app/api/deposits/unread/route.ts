import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

export const dynamic = 'force-dynamic';

/** Returns count of unread (new) pending deposits. */
export async function GET() {
  const payload = await requirePermission('deposit.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM deposit_requests WHERE erp_unread = true`
  );
  return NextResponse.json({ count: rows[0]?.count ?? 0 });
}

/** Clears the badge — marks all unread deposits as seen. */
export async function POST() {
  const payload = await requirePermission('deposit.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await pool.query(`UPDATE deposit_requests SET erp_unread = false WHERE erp_unread = true`);
  return NextResponse.json({ ok: true });
}
