import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

function isMissingColumnError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as Record<string, unknown>).code === '42703';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const { type, id } = await params;

  if (type === 'deposit') {
    const payload = await requirePermission('deposit.view');
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } else if (type === 'withdrawal') {
    const payload = await requirePermission('withdraw.view');
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } else {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  if (type === 'deposit') {
    return handleDeposit(numId);
  }
  return handleWithdrawal(numId);
}

async function handleDeposit(id: number) {
  const queries = [
    // With processing columns (migration 065)
    `SELECT
       dr.id, 'deposit'::text AS type, dr.user_id,
       dr.deposit_amount, dr.bonus_amount, dr.credit_amount, dr.payment_bank,
       dr.status, dr.reject_reason, dr.created_at, dr.reviewed_at,
       dr.processing_by, dr.processing_at, dr.approved_by, dr.approved_at, dr.rejected_by, dr.rejected_at,
       u.first_name, u.phone, u.public_id, u.available_balance,
       p.name AS promo_name,
       dr.receiving_bank_id,
       pb.bank_name      AS receiving_bank_name,
       pb.account_name   AS receiving_bank_account_name,
       pb.account_number AS receiving_bank_account_number,
       pb.qr_media_id    AS receiving_bank_qr_media_id,
       a.erp_username    AS processing_by_name
     FROM deposit_requests dr
     JOIN users u ON u.id = dr.user_id
     LEFT JOIN promotions p ON p.id = dr.promotion_id
     LEFT JOIN payment_banks pb ON pb.id = dr.receiving_bank_id
     LEFT JOIN admins a ON a.id = dr.processing_by
     WHERE dr.id = $1`,
    // Fallback (no processing columns / no receiving bank columns)
    `SELECT
       dr.id, 'deposit'::text AS type, dr.user_id,
       dr.deposit_amount, dr.bonus_amount, dr.credit_amount, dr.payment_bank,
       dr.status, dr.reject_reason, dr.created_at, dr.reviewed_at,
       NULL::int AS processing_by, NULL::timestamptz AS processing_at,
       NULL::int AS approved_by, NULL::timestamptz AS approved_at,
       NULL::int AS rejected_by, NULL::timestamptz AS rejected_at,
       u.first_name, u.phone, u.public_id, u.available_balance,
       p.name AS promo_name,
       NULL::int  AS receiving_bank_id,
       NULL::text AS receiving_bank_name,
       NULL::text AS receiving_bank_account_name,
       NULL::text AS receiving_bank_account_number,
       NULL::int  AS receiving_bank_qr_media_id,
       NULL::text AS processing_by_name
     FROM deposit_requests dr
     JOIN users u ON u.id = dr.user_id
     LEFT JOIN promotions p ON p.id = dr.promotion_id
     WHERE dr.id = $1`,
  ];

  for (const sql of queries) {
    try {
      const { rows } = await pool.query(sql, [id]);
      if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json(rows[0]);
    } catch (err) {
      if (isMissingColumnError(err)) continue;
      console.error('[transactions/deposit] error:', err);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

async function handleWithdrawal(id: number) {
  const queries = [
    // With processing columns + turnover (migration 065)
    `SELECT
       wr.id, 'withdrawal'::text AS type, wr.user_id,
       wr.withdraw_amount, wr.provider, wr.game_username,
       wr.bank_name, wr.bank_account, wr.bank_holder_name, wr.receipt_media_id,
       wr.status, wr.reject_reason, wr.created_at, wr.reviewed_at,
       wr.processing_by, wr.processing_at, wr.approved_by, wr.approved_at, wr.rejected_by, wr.rejected_at,
       u.first_name, u.phone, u.public_id, u.available_balance,
       a.erp_username AS processing_by_name,
       bc.turnover_required  AS active_turnover_required,
       bc.turnover_completed AS active_turnover_completed
     FROM withdrawal_requests wr
     JOIN users u ON u.id = wr.user_id
     LEFT JOIN admins a ON a.id = wr.processing_by
     LEFT JOIN LATERAL (
       SELECT turnover_required, turnover_completed
       FROM bonus_claims
       WHERE user_id = wr.user_id AND status = 'ACTIVE'
       ORDER BY claimed_at DESC
       LIMIT 1
     ) bc ON true
     WHERE wr.id = $1`,
    // Fallback (no processing columns)
    `SELECT
       wr.id, 'withdrawal'::text AS type, wr.user_id,
       wr.withdraw_amount, wr.provider, wr.game_username,
       wr.bank_name, wr.bank_account, wr.bank_holder_name, wr.receipt_media_id,
       wr.status, wr.reject_reason, wr.created_at, wr.reviewed_at,
       NULL::int AS processing_by, NULL::timestamptz AS processing_at,
       NULL::int AS approved_by, NULL::timestamptz AS approved_at,
       NULL::int AS rejected_by, NULL::timestamptz AS rejected_at,
       u.first_name, u.phone, u.public_id, u.available_balance,
       NULL::text AS processing_by_name,
       NULL::numeric AS active_turnover_required,
       NULL::numeric AS active_turnover_completed
     FROM withdrawal_requests wr
     JOIN users u ON u.id = wr.user_id
     WHERE wr.id = $1`,
  ];

  for (const sql of queries) {
    try {
      const { rows } = await pool.query(sql, [id]);
      if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json(rows[0]);
    } catch (err) {
      if (isMissingColumnError(err)) continue;
      console.error('[transactions/withdrawal] error:', err);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
