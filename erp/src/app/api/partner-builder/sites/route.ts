import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import {
  getAllSites, createSite, slugExists,
  getTemplateById, getThemeById,
} from '@/lib/repositories/partner_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function GET() {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const sites = await getAllSites();
    return NextResponse.json(sites);
  } catch (e) {
    console.error('[partner-builder/sites GET]', e);
    return NextResponse.json({ error: 'Failed to load sites' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    name?: string;
    slug?: string;
    page_type?: string;
    template_id?: number;
    theme_id?: number;
    status?: string;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (!body.slug?.trim()) return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  if (!body.template_id)  return NextResponse.json({ error: 'template_id is required' }, { status: 400 });
  if (!body.theme_id)     return NextResponse.json({ error: 'theme_id is required' }, { status: 400 });

  const slug = body.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  if (await slugExists(slug)) {
    return NextResponse.json({ error: `Slug "${slug}" is already taken` }, { status: 409 });
  }

  const [template, theme] = await Promise.all([
    getTemplateById(body.template_id),
    getThemeById(body.theme_id),
  ]);
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  if (!theme)    return NextResponse.json({ error: 'Theme not found' }, { status: 404 });

  try {
    const site = await createSite({
      name:        body.name.trim(),
      slug,
      page_type:   body.page_type ?? 'partner',
      template_id: body.template_id,
      theme_id:    body.theme_id,
      status:      ((body.status as string | undefined)?.toUpperCase() as 'DRAFT' | 'PUBLISHED') ?? 'DRAFT',
      created_by:  payload.sub,
    });
    await logAudit({
      admin_id: payload.sub, action: 'PARTNER_SITE_CREATE',
      target_type: 'partner_site', target_id: site.id,
      new_value: { name: site.name, slug: site.slug },
    });
    return NextResponse.json(site, { status: 201 });
  } catch (e) {
    console.error('[partner-builder/sites POST]', e);
    return NextResponse.json({ error: 'Failed to create site' }, { status: 500 });
  }
}
