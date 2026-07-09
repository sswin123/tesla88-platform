import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getBannerById, updateBanner, deleteBanner } from '@/lib/repositories/banner_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('website.banner.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const banner = await getBannerById(parseInt(id, 10));
  if (!banner) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(banner);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const payload = await requirePermission('website.banner.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id, 10);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const old = await getBannerById(numId);
  if (!old) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await updateBanner(numId, body as Parameters<typeof updateBanner>[1]);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await logAudit({
    admin_id:    payload.sub,
    action:      'BANNER_UPDATE',
    target_type: 'website_banner',
    target_id:   numId,
    old_value:   { title: old.title, is_active: old.is_active },
    new_value:   body as Record<string, unknown>,
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('website.banner.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id, 10);

  const old = await getBannerById(numId);
  if (!old) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const deleted = await deleteBanner(numId);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await logAudit({
    admin_id:    payload.sub,
    action:      'BANNER_DELETE',
    target_type: 'website_banner',
    target_id:   numId,
    old_value:   { title: old.title },
    new_value:   null,
  });

  return NextResponse.json({ ok: true });
}
