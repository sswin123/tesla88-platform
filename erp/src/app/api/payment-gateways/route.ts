import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

export async function GET() {
  const payload = await requirePermission('member.wallet.adjust');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows } = await pool.query(
    `SELECT name, display_name
     FROM payment_gateways
     WHERE is_active = TRUE
     ORDER BY sort_order, display_name`,
  );

  return NextResponse.json(rows);
}
