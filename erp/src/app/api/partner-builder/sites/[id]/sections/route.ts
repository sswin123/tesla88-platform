import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getSiteById, getSectionsBySite, createSection } from '@/lib/repositories/partner_repo';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const site = await getSiteById(Number(id));
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

  const sections = await getSectionsBySite(site.id);
  return NextResponse.json(sections);
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const site = await getSiteById(Number(id));
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

  let body: { section_type?: string; content_json?: Record<string, unknown>; sort_order?: number; is_enabled?: boolean };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.section_type) return NextResponse.json({ error: 'section_type is required' }, { status: 400 });

  try {
    const section = await createSection({
      site_id:      site.id,
      section_type: body.section_type,
      content_json: body.content_json ?? {},
      sort_order:   body.sort_order ?? 0,
      is_enabled:   body.is_enabled ?? true,
    });
    return NextResponse.json(section, { status: 201 });
  } catch (e) {
    console.error('[partner-builder/sites/[id]/sections POST]', e);
    return NextResponse.json({ error: 'Failed to create section' }, { status: 500 });
  }
}
