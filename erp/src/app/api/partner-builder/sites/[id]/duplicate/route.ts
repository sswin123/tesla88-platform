import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getSiteById, duplicateSite, slugExists } from '@/lib/repositories/partner_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const siteId = Number(id);
  const existing = await getSiteById(siteId);
  if (!existing) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

  let body: { name?: string; slug?: string } = {};
  try { body = await request.json(); } catch { /* ok */ }

  const newName = body.name?.trim() || `${existing.name} (Copy)`;
  const rawSlug = body.slug?.trim() || `${existing.slug}-copy`;
  const newSlug = rawSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

  if (await slugExists(newSlug)) {
    return NextResponse.json({ error: `Slug "${newSlug}" is already taken` }, { status: 409 });
  }

  const newSite = await duplicateSite(siteId, newName, newSlug, payload.sub);
  if (!newSite) return NextResponse.json({ error: 'Duplicate failed' }, { status: 500 });

  await logAudit({
    admin_id: payload.sub, action: 'PARTNER_SITE_DUPLICATE',
    target_type: 'partner_site', target_id: newSite.id,
    new_value: { source_id: siteId, name: newSite.name, slug: newSite.slug },
  });

  return NextResponse.json(newSite, { status: 201 });
}
