import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import {
  getSiteById, updateSite, softDeleteSite, slugExists,
} from '@/lib/repositories/partner_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const site = await getSiteById(Number(id));
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });
  return NextResponse.json(site);
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const siteId = Number(id);
  const existing = await getSiteById(siteId);
  if (!existing) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (body.slug && typeof body.slug === 'string') {
    const slug = body.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    body.slug = slug;
    if (await slugExists(slug, siteId)) {
      return NextResponse.json({ error: `Slug "${slug}" is already taken` }, { status: 409 });
    }
  }

  try {
    const updated = await updateSite(siteId, body as Parameters<typeof updateSite>[1]);
    await logAudit({
      admin_id: payload.sub, action: 'PARTNER_SITE_UPDATE',
      target_type: 'partner_site', target_id: siteId,
      new_value: body,
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error('[partner-builder/sites/[id] PATCH]', e);
    return NextResponse.json({ error: 'Failed to update site' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const siteId = Number(id);
  const existing = await getSiteById(siteId);
  if (!existing) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

  await softDeleteSite(siteId);
  await logAudit({
    admin_id: payload.sub, action: 'PARTNER_SITE_DELETE',
    target_type: 'partner_site', target_id: siteId,
    new_value: { name: existing.name, slug: existing.slug },
  });
  return NextResponse.json({ ok: true });
}
