import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getBankById, updateBank, setBankActive, deleteBank } from '@/lib/repositories/bank_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const bank = await getBankById(parseInt(id, 10));
  if (!bank) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(bank);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id, 10);

  let body: {
    bank_name?: string;
    account_number?: string;
    account_name?: string;
    qr_image?: string | null;
    display_order?: number;
    is_active?: boolean;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const old = await getBankById(numId);
  if (!old) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let updated;
  if (typeof body.is_active === 'boolean') {
    updated = await setBankActive(numId, body.is_active);
    await logAudit({
      admin_id: payload.sub,
      action: body.is_active ? 'BANK_ACTIVATE' : 'BANK_DEACTIVATE',
      target_type: 'bank',
      target_id: numId,
      old_value: { is_active: old.is_active },
      new_value: { is_active: body.is_active },
    });
  } else {
    const { is_active: _ig, ...fields } = body;
    updated = await updateBank(numId, fields);
    await logAudit({
      admin_id: payload.sub,
      action: 'BANK_UPDATE',
      target_type: 'bank',
      target_id: numId,
      old_value: old as unknown as Record<string, unknown>,
      new_value: fields as Record<string, unknown>,
    });
  }

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id, 10);

  const old = await getBankById(numId);
  if (!old) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const deleted = await deleteBank(numId);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await logAudit({
    admin_id: payload.sub,
    action: 'BANK_DELETE',
    target_type: 'bank',
    target_id: numId,
    old_value: old as unknown as Record<string, unknown>,
    new_value: null,
  });

  return NextResponse.json({ ok: true });
}
