import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getAllBanners, createBanner } from '@/lib/repositories/banner_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

// @deprecated Phase M4b — Legacy website_banners CRUD API with zero active consumers.
// ERP UI (website-banners page) migrated to /api/website/banner-slides (CMS homepage_sections).
// Infrastructure preserved pending M4c approval + 14-day production observation.

const DEPRECATION_HEADERS = {
  Deprecation: 'true',
  'X-Deprecation-Info': 'Legacy Banner CRUD deprecated (Phase M4b). Pending M4c retirement after observation.',
} as const;

export async function GET() {
  const payload = await requirePermission('website.banner.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const banners = await getAllBanners();
  return NextResponse.json(banners, { headers: DEPRECATION_HEADERS });
}

export async function POST(req: NextRequest) {
  const payload = await requirePermission('website.banner.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    title?: string;
    description?: string | null;
    image_media_id?: number | null;
    mobile_image_media_id?: number | null;
    link_url?: string | null;
    button_text?: string | null;
    display_order?: number;
    is_active?: boolean;
    start_at?: string | null;
    end_at?: string | null;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.title?.trim())
    return NextResponse.json({ error: 'title is required' }, { status: 400 });

  const banner = await createBanner({
    title:                 body.title.trim(),
    description:           body.description ?? null,
    image_media_id:        body.image_media_id ?? null,
    mobile_image_media_id: body.mobile_image_media_id ?? null,
    link_url:              body.link_url ?? null,
    button_text:           body.button_text ?? null,
    display_order:         body.display_order ?? 0,
    is_active:             body.is_active ?? true,
    start_at:              body.start_at ?? null,
    end_at:                body.end_at ?? null,
  });

  await logAudit({
    admin_id:    payload.sub,
    action:      'BANNER_CREATE',
    target_type: 'website_banner',
    target_id:   banner.id,
    new_value:   { title: banner.title, is_active: banner.is_active },
  });

  return NextResponse.json(banner, { status: 201, headers: DEPRECATION_HEADERS });
}
