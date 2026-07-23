import { NextRequest, NextResponse } from 'next/server';
import { getPublicSiteBySlug } from '@/lib/repositories/partner_repo';

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { slug } = await params;

  try {
    const data = await getPublicSiteBySlug(slug);
    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' },
    });
  } catch (e) {
    console.error('[public/partner/[slug] GET]', e);
    return NextResponse.json({ error: 'Failed to load page' }, { status: 500 });
  }
}
