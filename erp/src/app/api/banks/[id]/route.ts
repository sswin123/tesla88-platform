import { NextRequest, NextResponse } from 'next/server';
import { updateBank, setBankActive } from '@/lib/repositories/bank_repo';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = parseInt(id, 10);

  let body: { bank_name?: string; account_number?: string; account_holder?: string; sort_order?: number; is_active?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.is_active === 'boolean') {
    const updated = await setBankActive(numId, body.is_active);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(updated);
  }

  const { is_active: _ig, ...fields } = body;
  const updated = await updateBank(numId, fields);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}
