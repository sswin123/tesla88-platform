import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getCardById, updateCard, deleteCard } from '@/lib/repositories/partner_repo';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await getCardById(Number(id));
  if (!existing) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const updated = await updateCard(Number(id), body as Parameters<typeof updateCard>[1]);
    return NextResponse.json(updated);
  } catch (e) {
    console.error('[partner-builder/cards/[id] PATCH]', e);
    return NextResponse.json({ error: 'Failed to update card' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await getCardById(Number(id));
  if (!existing) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  await deleteCard(Number(id));
  return NextResponse.json({ ok: true });
}
