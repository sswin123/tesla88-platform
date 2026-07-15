import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

export async function POST(req: NextRequest) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { orders: { id: number; display_order: number }[] };
  const { orders } = body;
  if (!Array.isArray(orders) || orders.length === 0) {
    return NextResponse.json({ error: 'orders array required' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { id, display_order } of orders) {
      await client.query(
        'UPDATE homepage_sections SET display_order = $1 WHERE id = $2',
        [display_order, id]
      );
    }
    await client.query('COMMIT');
    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[homepage-sections/reorder]', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  } finally {
    client.release();
  }
}
