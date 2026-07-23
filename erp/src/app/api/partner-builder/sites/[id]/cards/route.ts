import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getSiteById, getCardsBySite, createCard } from '@/lib/repositories/partner_repo';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const site = await getSiteById(Number(id));
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

  const cards = await getCardsBySite(site.id);
  return NextResponse.json(cards);
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const site = await getSiteById(Number(id));
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.brand_name || typeof body.brand_name !== 'string') {
    return NextResponse.json({ error: 'brand_name is required' }, { status: 400 });
  }

  try {
    const card = await createCard({
      site_id:         site.id,
      brand_name:      body.brand_name,
      logo_media_id:   (body.logo_media_id as number) ?? null,
      subtitle:        (body.subtitle as string) ?? null,
      description:     (body.description as string) ?? null,
      badge:           (body.badge as string) ?? null,
      welcome_bonus:   (body.welcome_bonus as string) ?? null,
      free_credit:     (body.free_credit as string) ?? null,
      commission:      (body.commission as string) ?? null,
      promo_text:      (body.promo_text as string) ?? null,
      telegram_url:    (body.telegram_url as string) ?? null,
      whatsapp_url:    (body.whatsapp_url as string) ?? null,
      website_url:     (body.website_url as string) ?? null,
      button_text:     (body.button_text as string) ?? 'Join Now',
      button_color:    (body.button_color as string) ?? null,
      button_style:    (body.button_style as string) ?? 'solid',
      card_bg_color:   (body.card_bg_color as string) ?? null,
      card_bg_media_id:(body.card_bg_media_id as number) ?? null,
      sort_order:      (body.sort_order as number) ?? 0,
    });
    return NextResponse.json(card, { status: 201 });
  } catch (e) {
    console.error('[partner-builder/sites/[id]/cards POST]', e);
    return NextResponse.json({ error: 'Failed to create card' }, { status: 500 });
  }
}
