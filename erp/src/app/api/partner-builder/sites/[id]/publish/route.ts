import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getSiteById, publishSite } from '@/lib/repositories/partner_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const siteId = Number(id);
  const existing = await getSiteById(siteId);
  if (!existing) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

  let body: { publish?: boolean } = {};
  try { body = await request.json(); } catch { /* publish toggle */ }
  const publish = body.publish !== false;

  const updated = await publishSite(siteId, publish);
  await logAudit({
    admin_id: payload.sub,
    action: publish ? 'PARTNER_SITE_PUBLISH' : 'PARTNER_SITE_UNPUBLISH',
    target_type: 'partner_site', target_id: siteId,
    new_value: { slug: existing.slug, status: publish ? 'PUBLISHED' : 'DRAFT' },
  });

  return NextResponse.json({ ok: true, site: updated });
}
