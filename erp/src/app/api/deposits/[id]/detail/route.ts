import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

function isMissingColumnError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as Record<string, unknown>).code === '42703';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('deposit.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const phonePayload = await requirePermission('member.view_phone');
  const canViewPhone = !!phonePayload;

  // New schema (migration 027): includes receiving_bank_* columns
  // Legacy fallback: nulls for those columns
  const queries = [
    `SELECT
       dr.id, dr.deposit_amount, dr.bonus_amount, dr.credit_amount,
       dr.payment_bank, dr.status, dr.created_at, dr.reject_reason,
       u.first_name, u.phone, u.public_id,
       p.name AS promo_name,
       dr.receiving_bank_id,
       pb.bank_name      AS receiving_bank_name,
       pb.account_name   AS receiving_bank_account_name,
       pb.account_number AS receiving_bank_account_number,
       pb.qr_media_id    AS receiving_bank_qr_media_id
     FROM deposit_requests dr
     JOIN users u ON u.id = dr.user_id
     LEFT JOIN promotions p ON p.id = dr.promotion_id
     LEFT JOIN payment_banks pb ON pb.id = COALESCE(
       (SELECT id FROM payment_banks WHERE id = dr.receiving_bank_id LIMIT 1),
       (SELECT id FROM payment_banks WHERE bank_name = dr.payment_bank ORDER BY id LIMIT 1),
       (SELECT id FROM payment_banks WHERE bank_name ILIKE dr.payment_bank ORDER BY id LIMIT 1),
       (SELECT id FROM payment_banks WHERE bank_name ILIKE '%' || dr.payment_bank || '%' ORDER BY id LIMIT 1)
     )
     WHERE dr.id = $1`,
    `SELECT
       dr.id, dr.deposit_amount, dr.bonus_amount, dr.credit_amount,
       dr.payment_bank, dr.status, dr.created_at, dr.reject_reason,
       u.first_name, u.phone, u.public_id,
       p.name AS promo_name,
       NULL::integer AS receiving_bank_id,
       NULL::text    AS receiving_bank_name,
       NULL::text    AS receiving_bank_account_name,
       NULL::text    AS receiving_bank_account_number,
       NULL::integer AS receiving_bank_qr_media_id
     FROM deposit_requests dr
     JOIN users u ON u.id = dr.user_id
     LEFT JOIN promotions p ON p.id = dr.promotion_id
     WHERE dr.id = $1`,
  ];

  let row: Record<string, unknown> | undefined;

  for (const sql of queries) {
    try {
      const { rows } = await pool.query(sql, [numId]);
      row = rows[0] as Record<string, unknown> | undefined;
      break;
    } catch (err) {
      if (isMissingColumnError(err)) {
        console.warn('[deposits/detail] migration pending, trying legacy query');
        continue;
      }
      console.error('[deposits/detail] query error:', err);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
  }

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Mask phone if caller lacks member.view_phone
  if (!canViewPhone) {
    const p = (row.phone as string) ?? '';
    row.phone = p.length <= 6
      ? '*'.repeat(p.length)
      : p.slice(0, 4) + '*'.repeat(p.length - 6) + p.slice(-2);
  }

  return NextResponse.json(row);
}
