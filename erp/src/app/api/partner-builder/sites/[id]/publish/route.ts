import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getSiteById, publishSite } from '@/lib/repositories/partner_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

/** Notify website to bust the ISR cache for the given partner page slug */
async function notifyWebsiteRevalidate(slug: string): Promise<void> {
  const websiteUrl = (process.env.WEBSITE_INTERNAL_URL ?? '').replace(/\/$/, '');
  const secret     = process.env.REVALIDATE_SECRET ?? '';
  if (!websiteUrl || !secret) return;

  try {
    await fetch(`${websiteUrl}/api/revalidate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ tag: `partner-site-${slug}`, secret }),
      signal:  AbortSignal.timeout(5000),
    });
  } catch {
    /* Non-fatal: ISR will re-render on the next 60-second window */
  }
}

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

  /* Bust the website's ISR cache for this slug immediately on publish */
  if (publish) {
    await notifyWebsiteRevalidate(existing.slug);
  }

  return NextResponse.json({ ok: true, site: updated });
}
