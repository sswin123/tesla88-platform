import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';
import { logAudit } from '@/lib/repositories/audit_repo';
import { adjustWallet, ADJUSTMENT_TYPES, TYPE_DIRECTION, type AdjustmentType, type Direction } from '@/lib/services/wallet';
import { ActivityLogService } from '@/lib/services/activity-log';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const payload = await requirePermission('member.wallet.adjust');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const uid = parseInt(id, 10);
  if (isNaN(uid)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: {
    type?: string;
    direction?: string;
    amount?: number;
    gateway?: string;
    reference_number?: string;
    remark?: string;
    attachment_media_id?: number | null;
  };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Validate type
  const adjType = body.type as AdjustmentType | undefined;
  if (!adjType || !(ADJUSTMENT_TYPES as readonly string[]).includes(adjType)) {
    return NextResponse.json({ error: 'Invalid adjustment type' }, { status: 400 });
  }

  // Determine direction
  const fixedDir = TYPE_DIRECTION[adjType];
  let direction: Direction;
  if (fixedDir) {
    direction = fixedDir;
  } else {
    // CORRECTION or OTHERS — caller must supply
    if (body.direction !== 'C' && body.direction !== 'D') {
      return NextResponse.json({ error: 'Direction (C/D) is required for this adjustment type' }, { status: 400 });
    }
    direction = body.direction as Direction;
  }

  // Validate amount
  const amount = typeof body.amount === 'number' ? body.amount : parseFloat(String(body.amount ?? ''));
  if (!amount || amount <= 0 || !isFinite(amount)) {
    return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
  }

  // Validate remark
  if (!body.remark?.trim()) {
    return NextResponse.json({ error: 'Remark is required' }, { status: 400 });
  }

  // For PAYMENT_GATEWAY: gateway + reference_number required
  if (adjType === 'PAYMENT_GATEWAY') {
    if (!body.gateway?.trim()) {
      return NextResponse.json({ error: 'Payment gateway is required' }, { status: 400 });
    }
    if (!body.reference_number?.trim()) {
      return NextResponse.json({ error: 'Reference number is required for payment gateway adjustments' }, { status: 400 });
    }
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
           ?? req.headers.get('x-real-ip')
           ?? 'unknown';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tx = await adjustWallet(client, {
      userId:           uid,
      type:             adjType,
      direction,
      amount,
      gateway:          body.gateway ?? null,
      referenceNumber:  body.reference_number ?? null,
      remark:           body.remark.trim(),
      attachmentMediaId: body.attachment_media_id ?? null,
      operatorAdminId:  payload.sub,
      ipAddress:        ip,
    });

    await client.query('COMMIT');

    await Promise.all([
      logAudit({
        admin_id:    payload.sub,
        action:      `wallet.${direction === 'C' ? 'credit' : 'debit'}`,
        target_type: 'user',
        target_id:   uid,
        old_value:   { balance: tx.balance_before },
        new_value:   { balance: tx.balance_after, type: adjType, amount, remark: body.remark.trim() },
      }),
      ActivityLogService.log({
        member_id:      uid,
        category:       'WALLET',
        action:         adjType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
        title:          `${direction === 'C' ? '+' : '-'}RM ${amount.toFixed(2)} — ${adjType}`,
        amount:         direction === 'C' ? amount : -amount,
        balance_before: parseFloat(String(tx.balance_before)),
        balance_after:  parseFloat(String(tx.balance_after)),
        reference_type: 'wallet',
        reference_id:   parseInt(tx.id, 10),
        operator_type:  'STAFF',
        operator_id:    payload.sub,
        operator_name:  typeof payload.username === 'string' ? payload.username : null,
        source:         'ERP',
        level:          amount >= 500 ? 'WARNING' : 'INFO',
        ip_address:     ip,
        remark:         body.remark?.trim() ?? null,
        metadata: {
          adj_type:  adjType,
          direction,
          gateway:   body.gateway ?? null,
          reference: body.reference_number ?? null,
        },
      }),
    ]);

    return NextResponse.json({ ok: true, tx });
  } catch (err) {
    await client.query('ROLLBACK');
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 400 });
  } finally {
    client.release();
  }
}
