import pool from '@/lib/db';

export interface PublicBrand {
  brand_name: string;
  company_name: string;
  tagline: string | null;
  logo_media_id: number | null;
  favicon_media_id: number | null;
  primary_color: string;
  secondary_color: string;
  theme_mode: string;
  website_domain: string | null;
  api_domain: string | null;
  support_whatsapp: string | null;
  support_telegram: string | null;
  telegram_channel: string | null;
  facebook_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
}

export const BRAND_FALLBACK: PublicBrand = {
  brand_name: 'SSWIN88',
  company_name: 'SSWIN88',
  tagline: null,
  logo_media_id: null,
  favicon_media_id: null,
  primary_color: '#1d4ed8',
  secondary_color: '#1e40af',
  theme_mode: 'light',
  website_domain: null,
  api_domain: null,
  support_whatsapp: null,
  support_telegram: null,
  telegram_channel: null,
  facebook_url: null,
  seo_title: null,
  seo_description: null,
  seo_keywords: null,
};

let _cache: PublicBrand | null = null;
let _cacheAt = 0;
const TTL_MS = 60_000;

export function invalidateBrandCache(): void {
  _cache = null;
  _cacheAt = 0;
}

export async function getBrand(): Promise<PublicBrand> {
  if (_cache && Date.now() - _cacheAt < TTL_MS) return _cache;
  try {
    const r = await pool.query<PublicBrand>(
      `SELECT brand_name, company_name, tagline,
              logo_media_id, favicon_media_id,
              primary_color, secondary_color, theme_mode,
              website_domain, api_domain,
              support_whatsapp, support_telegram, telegram_channel, facebook_url,
              seo_title, seo_description, seo_keywords
       FROM brand_settings WHERE id = 1`
    );
    _cache = r.rows[0] ?? BRAND_FALLBACK;
    _cacheAt = Date.now();
    return _cache;
  } catch {
    return BRAND_FALLBACK;
  }
}
