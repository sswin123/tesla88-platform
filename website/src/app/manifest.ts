import type { MetadataRoute } from 'next';
import { getBrand } from '@/lib/brand';

export const dynamic = 'force-dynamic';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await getBrand();

  const icons: MetadataRoute.Manifest['icons'] = brand.logo_media_id
    ? [
        {
          src: `/api/public/media/${brand.logo_media_id}`,
          sizes: 'any',
          purpose: 'any',
        },
        {
          src: `/api/public/media/${brand.logo_media_id}`,
          sizes: 'any',
          purpose: 'maskable',
        },
      ]
    : [];

  return {
    name: brand.brand_name,
    short_name: brand.brand_name,
    description:
      brand.seo_description ??
      brand.tagline ??
      `${brand.brand_name} - Online Casino`,
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0b14',
    theme_color: brand.primary_color,
    orientation: 'portrait',
    categories: ['entertainment', 'games'],
    icons,
  };
}
