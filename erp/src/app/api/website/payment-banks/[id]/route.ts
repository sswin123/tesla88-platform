import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getBankById, updateBank, setBankActive, deleteBank } from '@/lib/repositories/bank_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('payment.bank.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const bank = await getBankById(parseInt(id, 10));
  if (!bank) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(bank);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const payload = await requirePermission('payment.bank.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id, 10);

  let body: {
    bank_name?: string;
    account_number?: string;
    account_name?: string;
    qr_media_id?: number | null;
    instructions?: string | null;
    display_order?: number;
    is_active?: boolean;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const old = await getBankById(numId);
  if (!old) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let updated;
  if (typeof body.is_active === 'boolean') {
    updated = await setBankActive(numId, body.is_active);
  } else {
    const { is_active: _ig, ...fields } = body;
    updated = await updateBank(numId, fields);
  }
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await logAudit({
    admin_id:    payload.sub,
    action:      'PAYMENT_BANK_UPDATE',
    target_type: 'payment_bank',
    target_id:   numId,
    old_value:   { bank_name: old.bank_name, is_active: old.is_active },
    new_value:   body as Record<string, unknown>,
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('payment.bank.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id, 10);

  const old = await getBankById(numId);
  if (!old) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const deleted = await deleteBank(numId);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await logAudit({
    admin_id:    payload.sub,
    action:      'PAYMENT_BANK_DELETE',
    target_type: 'payment_bank',
    target_id:   numId,
    old_value:   { bank_name: old.bank_name },
    new_value:   null,
  });

  return NextResponse.json({ ok: true });
}
