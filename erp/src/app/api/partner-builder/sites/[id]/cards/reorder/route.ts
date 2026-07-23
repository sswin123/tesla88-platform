import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getSiteById, reorderCards } from '@/lib/repositories/partner_repo';

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Ctx) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const site = await getSiteById(Number(id));
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

  let body: { items?: { id: number; sort_order: number }[] };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'items array is required' }, { status: 400 });
  }

  try {
    await reorderCards(body.items);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[partner-builder/cards/reorder PUT]', e);
    return NextResponse.json({ error: 'Failed to reorder cards' }, { status: 500 });
  }
}
