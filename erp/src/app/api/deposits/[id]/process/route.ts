import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { logAudit } from '@/lib/repositories/audit_repo';
import { requirePermission } from '@/lib/require_permission';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('deposit.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const adminId = payload.sub;

  const { id } = await params;
  const requestId = parseInt(id, 10);
  if (isNaN(requestId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the row — first one wins, prevents race condition between concurrent CS
    const { rows } = await client.query<{
      id: number; status: string; processing_by: number | null; processing_by_name: string | null;
    }>(
      `SELECT dr.id, dr.status, dr.processing_by, a.erp_username AS processing_by_name
       FROM deposit_requests dr
       LEFT JOIN admins a ON a.id = dr.processing_by
       WHERE dr.id = $1
       FOR UPDATE`,
      [requestId]
    );

    if (!rows[0]) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Deposit not found' }, { status: 404 });
    }

    const row = rows[0];

    if (row.status !== 'PENDING') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Deposit is no longer pending', status: row.status }, { status: 409 });
    }

    if (row.processing_by !== null) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: `Already being processed by ${row.processing_by_name ?? 'another CS'}`, locked_by: row.processing_by_name },
        { status: 409 }
      );
    }

    await client.query(
      `UPDATE deposit_requests
       SET status = 'PROCESSING', processing_by = $2, processing_at = NOW()
       WHERE id = $1`,
      [requestId, adminId]
    );

    await client.query('COMMIT');

    await logAudit({
      admin_id: adminId,
      action: 'DEPOSIT_PROCESS',
      target_type: 'deposit',
      target_id: requestId,
      new_value: { status: 'PROCESSING', processing_by: adminId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    const code = typeof err === 'object' && err !== null ? (err as Record<string, unknown>).code : undefined;
    if (code === '42703') {
      return NextResponse.json({ error: 'Database migration 065 not applied. Run migrations first.' }, { status: 500 });
    }
    if (code === '23514') {
      return NextResponse.json({ error: 'PROCESSING status not allowed by database constraint. Run migrations first.' }, { status: 500 });
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[deposits/process]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
