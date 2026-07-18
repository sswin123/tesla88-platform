import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { logAudit } from '@/lib/repositories/audit_repo';
import { requirePermission } from '@/lib/require_permission';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('withdraw.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const adminId = payload.sub;

  const { id } = await params;
  const requestId = parseInt(id, 10);

  try {
    /* Move to AWAITING_RECEIPT — balance debit and PAID status happen on receipt upload */
    const { rows } = await pool.query<{ id: number }>(
      `UPDATE withdrawal_requests
       SET status = 'AWAITING_RECEIPT', reviewed_by = $2, reviewed_at = NOW(),
           approved_by = $3, approved_at = NOW()
       WHERE id = $1 AND status IN ('PENDING', 'PROCESSING')
       RETURNING id`,
      [requestId, adminId, adminId]
    );

    if (!rows[0]) {
      return NextResponse.json({ error: 'Not found or already processed' }, { status: 404 });
    }

    logAudit({
      admin_id:    adminId,
      action:      'WITHDRAWAL_APPROVE',
      target_type: 'withdrawal',
      target_id:   requestId,
      new_value:   { status: 'AWAITING_RECEIPT' },
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    const code = typeof err === 'object' && err !== null ? (err as Record<string, unknown>).code : undefined;
    if (code === '42703') return NextResponse.json({ error: 'Database migration 065 not applied. Run migrations first.' }, { status: 500 });
    if (code === '23514') return NextResponse.json({ error: 'Migration 067 required. Run ERP → Maintenance → Run Migrations.' }, { status: 500 });
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[withdrawals/approve]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
