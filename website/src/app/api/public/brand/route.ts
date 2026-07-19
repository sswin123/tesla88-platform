import { NextResponse } from 'next/server';
import { getBrand } from '@/lib/brand';

// Public brand fields safe to expose to unauthenticated Website Client Components.
// Consumers: ProfileCard (support_whatsapp, support_telegram), future social/contact widgets.
// Source of truth: brand_settings via getBrand() (2s cache, reads directly from DB).
export async function GET() {
  const brand = await getBrand();
  return NextResponse.json(
    {
      brand_name:       brand.brand_name,
      logo_media_id:    brand.logo_media_id,
      primary_color:    brand.primary_color,
      support_whatsapp: brand.support_whatsapp,
      support_telegram: brand.support_telegram,
      telegram_channel: brand.telegram_channel,
      facebook_url:     brand.facebook_url,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
