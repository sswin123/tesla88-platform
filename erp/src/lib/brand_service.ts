import { getBrandSettings, type BrandSettings } from '@/lib/repositories/brand_repo';

const CACHE_TTL_MS = 60_000;

const FALLBACK: BrandSettings = {
  id: 1,
  brand_name: '',
  company_name: '',
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
  erp_domain: null,
  support_whatsapp: null,
  support_telegram: null,
  telegram_channel: null,
  facebook_url: null,
  instagram_url: null,
  tiktok_url: null,
  support_email: null,
  seo_title: null,
  seo_description: null,
  seo_keywords: null,
  member_id_prefix: 'SS',
  design_preset: 'classic_purple',
  design_overrides: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  updated_by: null,
};

let cache: BrandSettings | null = null;
let cacheAt = 0;

async function loadCache(): Promise<BrandSettings> {
  if (cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache;
  try {
    const settings = await getBrandSettings();
    cache = settings ?? FALLBACK;
    cacheAt = Date.now();
    return cache;
  } catch {
    return cache ?? FALLBACK;
  }
}

export async function getBrand(): Promise<BrandSettings> {
  return loadCache();
}

export function invalidateBrandCache(): void {
  cache = null;
  cacheAt = 0;
}

export { FALLBACK as BRAND_FALLBACK };
