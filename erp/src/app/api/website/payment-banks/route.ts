import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getAllBanks, createBank } from '@/lib/repositories/bank_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function GET() {
  const payload = await requirePermission('payment.bank.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const banks = await getAllBanks();
  return NextResponse.json(banks);
}

export async function POST(req: NextRequest) {
  const payload = await requirePermission('payment.bank.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

  if (!body.bank_name?.trim())
    return NextResponse.json({ error: 'bank_name is required' }, { status: 400 });
  if (!body.account_number?.trim())
    return NextResponse.json({ error: 'account_number is required' }, { status: 400 });
  if (!body.account_name?.trim())
    return NextResponse.json({ error: 'account_name is required' }, { status: 400 });

  const bank = await createBank({
    bank_name:      body.bank_name.trim(),
    account_number: body.account_number.trim(),
    account_name:   body.account_name.trim(),
    qr_media_id:    body.qr_media_id ?? null,
    instructions:   body.instructions ?? null,
    display_order:  body.display_order ?? 0,
  });

  await logAudit({
    admin_id:    payload.sub,
    action:      'PAYMENT_BANK_CREATE',
    target_type: 'payment_bank',
    target_id:   bank.id,
    new_value:   { bank_name: bank.bank_name, account_number: bank.account_number },
  });

  return NextResponse.json(bank, { status: 201 });
}
