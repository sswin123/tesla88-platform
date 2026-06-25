import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import {
  getPromotionById, updatePromotion, setPromotionActive, softDeletePromotion
} from '@/lib/repositories/promotion_repo';
import { logAudit } from '@/lib/repositories/audit_repo';
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
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id, 10);

  let body: Partial<Promotion & { is_active: boolean }>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const old = await getPromotionById(numId);
  if (!old) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let updated;
  if (typeof body.is_active === 'boolean') {
    updated = await setPromotionActive(numId, body.is_active);
    await logAudit({
      admin_id: payload.sub,
      action: body.is_active ? 'PROMO_ACTIVATE' : 'PROMO_DEACTIVATE',
      target_type: 'promotion',
      target_id: numId,
      old_value: { is_active: old.is_active },
      new_value: { is_active: body.is_active },
    });
  } else {
    const { is_active: _ig, id: _id, created_at: _c, updated_at: _u,
            deleted_at: _d, ...updateFields } = body;
    updated = await updatePromotion(numId, updateFields as Parameters<typeof updatePromotion>[1]);
    await logAudit({
      admin_id: payload.sub,
      action: 'PROMO_UPDATE',
      target_type: 'promotion',
      target_id: numId,
      old_value: { name: old.name, bonus_value: old.bonus_value },
      new_value: updateFields as Record<string, unknown>,
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

  const old = await getPromotionById(numId);
  if (!old) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const deleted = await softDeletePromotion(numId);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await logAudit({
    admin_id: payload.sub,
    action: 'PROMO_DELETE',
    target_type: 'promotion',
    target_id: numId,
    old_value: { name: old.name },
    new_value: null,
  });

  return NextResponse.json({ ok: true });
}
