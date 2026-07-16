import pool from '@/lib/db';

export interface PublicBrand {
  brand_name: string;
  company_name: string;
  tagline: string | null;
  logo_media_id: number | null;
  favicon_media_id: number | null;
  logo_size: string;
  logo_align: string;
  primary_color: string;
  secondary_color: string;
  theme_mode: string;
  color_bg: string;
  color_card: string;
  color_text: string;
  website_domain: string | null;
  api_domain: string | null;
  support_whatsapp: string | null;
  support_telegram: string | null;
  telegram_channel: string | null;
  facebook_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  // Design System (Migration 032)
  design_preset: string;
  design_overrides: Record<string, string>;
}

export const BRAND_FALLBACK: PublicBrand = {
  brand_name: 'YourBrandName',
  company_name: 'YourBrandName',
  tagline: null,
  logo_media_id: null,
  favicon_media_id: null,
  logo_size: 'medium',
  logo_align: 'left',
  primary_color: '#1d4ed8',
  secondary_color: '#1e40af',
  theme_mode: 'light',
  color_bg: '#0a0b14',
  color_card: '#111222',
  color_text: '#e8e8f5',
  website_domain: null,
  api_domain: null,
  support_whatsapp: null,
  support_telegram: null,
  telegram_channel: null,
  facebook_url: null,
  seo_title: null,
  seo_description: null,
  seo_keywords: null,
  design_preset: 'classic_purple',
  design_overrides: {},
};

let _cache: PublicBrand | null = null;
let _cacheAt = 0;
const TTL_MS = 2_000; // 2s — near-instant theme updates after ERP save

export function invalidateBrandCache(): void {
  _cache = null;
  _cacheAt = 0;
}

const QUERY_V3 = `
  SELECT brand_name, company_name, tagline,
         logo_media_id, favicon_media_id,
         COALESCE(logo_size,  'medium') AS logo_size,
         COALESCE(logo_align, 'left')   AS logo_align,
         primary_color, secondary_color, theme_mode,
         COALESCE(color_bg,   '#0a0b14') AS color_bg,
         COALESCE(color_card, '#111222') AS color_card,
         COALESCE(color_text, '#e8e8f5') AS color_text,
         website_domain, api_domain,
         support_whatsapp, support_telegram, telegram_channel, facebook_url,
         seo_title, seo_description, seo_keywords,
         COALESCE(design_preset,   'classic_purple') AS design_preset,
         COALESCE(design_overrides, '{}')            AS design_overrides
  FROM brand_settings WHERE id = 1
`;

const QUERY_V2 = `
  SELECT brand_name, company_name, tagline,
         logo_media_id, favicon_media_id,
         COALESCE(logo_size,  'medium') AS logo_size,
         COALESCE(logo_align, 'left')   AS logo_align,
         primary_color, secondary_color, theme_mode,
         COALESCE(color_bg,   '#0a0b14') AS color_bg,
         COALESCE(color_card, '#111222') AS color_card,
         COALESCE(color_text, '#e8e8f5') AS color_text,
         website_domain, api_domain,
         support_whatsapp, support_telegram, telegram_channel, facebook_url,
         seo_title, seo_description, seo_keywords
  FROM brand_settings WHERE id = 1
`;

// Fallback query without Migration 024/025 columns
const QUERY_V1 = `
  SELECT brand_name, company_name, tagline,
         logo_media_id, favicon_media_id,
         primary_color, secondary_color, theme_mode,
         website_domain, api_domain,
         support_whatsapp, support_telegram, telegram_channel, facebook_url,
         seo_title, seo_description, seo_keywords
  FROM brand_settings WHERE id = 1
`;

export async function getBrand(): Promise<PublicBrand> {
  if (_cache && Date.now() - _cacheAt < TTL_MS) return _cache;

  // Try with Migration 032 (design system columns)
  try {
    const r = await pool.query<PublicBrand>(QUERY_V3);
    const row = r.rows[0];
    if (row) {
      // Ensure design_overrides is an object (DB returns JSONB as object already)
      if (typeof row.design_overrides === 'string') {
        row.design_overrides = JSON.parse(row.design_overrides) as Record<string, string>;
      }
      _cache = row;
    } else {
      _cache = BRAND_FALLBACK;
    }
    _cacheAt = Date.now();
    return _cache;
  } catch {
    // Migration 032 not applied — try V2
  }

  // Try with Migration 024 color columns
  try {
    const r = await pool.query<PublicBrand>(QUERY_V2);
    _cache = r.rows[0]
      ? { ...r.rows[0], design_preset: 'classic_purple', design_overrides: {} }
      : BRAND_FALLBACK;
    _cacheAt = Date.now();
    return _cache;
  } catch {
    // Migration 024 not yet applied — fallback query without color columns
    try {
      const r = await pool.query(QUERY_V1);
      if (!r.rows[0]) {
        _cache = BRAND_FALLBACK;
        _cacheAt = Date.now();
        return _cache;
      }
      _cache = {
        ...(r.rows[0] as Omit<PublicBrand, 'logo_size' | 'logo_align' | 'color_bg' | 'color_card' | 'color_text'>),
        logo_size:  'medium',
        logo_align: 'left',
        color_bg:   '#0a0b14',
        color_card: '#111222',
        color_text: '#e8e8f5',
      } as PublicBrand;
      _cacheAt = Date.now();
      return _cache;
    } catch (e2) {
      console.error('[brand] getBrand fallback failed:', e2);
      return BRAND_FALLBACK;
    }
  }
}
