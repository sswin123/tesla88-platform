import { getBrandSettings, type BrandSettings } from '@/lib/repositories/brand_repo';

const CACHE_TTL_MS = 60_000;

const FALLBACK: BrandSettings = {
  id: 1,
  // Brand Identity
  brand_name: '',
  company_name: '',
  tagline: null,
  short_name: null,
  description: null,
  website_name: null,
  member_id_prefix: 'SS',
  referral_prefix: null,
  // Brand Assets
  logo_media_id: null,
  favicon_media_id: null,
  logo_size: 'medium',
  logo_align: 'left',
  loading_logo_media_id: null,
  pwa_icon_media_id: null,
  apple_touch_media_id: null,
  og_image_media_id: null,
  share_image_media_id: null,
  splash_image_media_id: null,
  // Theme
  primary_color: '#1d4ed8',
  secondary_color: '#1e40af',
  theme_mode: 'light',
  color_bg: '#0a0b14',
  color_card: '#111222',
  color_text: '#e8e8f5',
  // Domain
  website_domain: null,
  api_domain: null,
  erp_domain: null,
  auto_detect_domain: false,
  // Contact
  support_whatsapp: null,
  support_telegram: null,
  telegram_channel: null,
  facebook_url: null,
  instagram_url: null,
  tiktok_url: null,
  support_email: null,
  support_line: null,
  support_wechat: null,
  support_messenger: null,
  support_discord: null,
  support_viber: null,
  support_x: null,
  support_youtube: null,
  // SEO: Basic
  seo_title: null,
  seo_description: null,
  seo_keywords: null,
  seo_author: null,
  canonical_url: null,
  robots: 'index, follow',
  // SEO: Open Graph
  og_title: null,
  og_description: null,
  og_image_url: null,
  // SEO: Twitter Card
  twitter_card: 'summary_large_image',
  twitter_title: null,
  twitter_description: null,
  twitter_image_url: null,
  // Brand Links
  link_apk: null,
  link_ios: null,
  link_tg_bot: null,
  link_tg_channel: null,
  link_cs: null,
  link_referral_base: null,
  link_cdn: null,
  link_promotion: null,
  link_vip: null,
  // System
  sys_timezone: 'Asia/Kuala_Lumpur',
  sys_language: 'zh-CN',
  sys_country: 'MY',
  sys_locale: 'ms-MY',
  // Design System
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
