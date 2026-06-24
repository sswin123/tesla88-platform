import { NextRequest, NextResponse } from 'next/server';
import { getPromotionById, updatePromotion, setPromotionActive } from '@/lib/repositories/promotion_repo';
import type { Promotion } from '@/lib/types';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const promo = await getPromotionById(parseInt(id, 10));
  if (!promo) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(promo);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = parseInt(id, 10);

  let body: Partial<Promotion & { is_active: boolean }>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Toggle active separately to match bot's set_promotion_active pattern
  if (typeof body.is_active === 'boolean') {
    const updated = await setPromotionActive(numId, body.is_active);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(updated);
  }

  // General field update
  const { is_active: _ignored, id: _id, created_at: _c, updated_at: _u, ...updateFields } = body;
  const updated = await updatePromotion(numId, updateFields as Parameters<typeof updatePromotion>[1]);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}
