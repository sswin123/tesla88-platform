import type { BrandSettings } from '@/lib/repositories/brand_repo';

export type FormState = {
  // Brand Identity
  brand_name: string;
  company_name: string;
  // Theme fields kept for data-layer compat (managed by Design System, not shown in Brand Center UI)
  primary_color: string;
  secondary_color: string;
  theme_mode: string;
  color_bg: string;
  color_card: string;
  color_text: string;
  tagline: string;
  short_name: string;
  description: string;
  website_name: string;
  member_id_prefix: string;
  referral_prefix: string;
  // Brand Assets
  logo_media_id: number | null;
  favicon_media_id: number | null;
  logo_size: string;
  logo_align: string;
  loading_logo_media_id: number | null;
  pwa_icon_media_id: number | null;
  apple_touch_media_id: number | null;
  og_image_media_id: number | null;
  share_image_media_id: number | null;
  splash_image_media_id: number | null;
  // Domain
  website_domain: string;
  api_domain: string;
  erp_domain: string;
  auto_detect_domain: boolean;
  // Contact
  support_whatsapp: string;
  support_telegram: string;
  telegram_channel: string;
  facebook_url: string;
  instagram_url: string;
  tiktok_url: string;
  support_email: string;
  support_phone: string;
  support_line: string;
  support_wechat: string;
  support_messenger: string;
  support_discord: string;
  support_viber: string;
  support_x: string;
  support_youtube: string;
  // SEO: Basic
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
  seo_author: string;
  canonical_url: string;
  robots: string;
  // SEO: Open Graph
  og_title: string;
  og_description: string;
  og_image_url: string;
  // SEO: Twitter Card
  twitter_card: string;
  twitter_title: string;
  twitter_description: string;
  twitter_image_url: string;
  // Brand Links
  link_apk: string;
  link_ios: string;
  link_tg_bot: string;
  link_tg_channel: string;
  link_cs: string;
  link_referral_base: string;
  link_cdn: string;
  link_promotion: string;
  link_vip: string;
  // System Info
  sys_timezone: string;
  sys_language: string;
  sys_country: string;
  sys_locale: string;
};

export function isValidUrl(url: string): boolean {
  if (!url.trim()) return true;
  try {
    const withProto =
      url.startsWith('http://') || url.startsWith('https://')
        ? url
        : `https://${url}`;
    const u = new URL(withProto);
    return !!u.hostname && u.hostname.includes('.');
  } catch {
    return false;
  }
}

export function hasBrandPermission(
  me: { isSuperAdmin: boolean; permissions: string[] } | null
): boolean {
  if (!me) return false;
  return me.isSuperAdmin || me.permissions.includes('brand.settings');
}

export function initForm(brand: BrandSettings): FormState {
  return {
    brand_name:        brand.brand_name,
    company_name:      brand.company_name,
    tagline:           brand.tagline           ?? '',
    short_name:        brand.short_name        ?? '',
    description:       brand.description       ?? '',
    website_name:      brand.website_name      ?? '',
    member_id_prefix:  brand.member_id_prefix  ?? 'SS',
    referral_prefix:   brand.referral_prefix   ?? '',
    primary_color:         brand.primary_color          ?? '#1d4ed8',
    secondary_color:       brand.secondary_color        ?? '#1e40af',
    theme_mode:            brand.theme_mode             ?? 'light',
    color_bg:              brand.color_bg               ?? '#0a0b14',
    color_card:            brand.color_card             ?? '#111222',
    color_text:            brand.color_text             ?? '#e8e8f5',
    logo_media_id:         brand.logo_media_id         ?? null,
    favicon_media_id:      brand.favicon_media_id      ?? null,
    logo_size:             brand.logo_size              ?? 'medium',
    logo_align:            brand.logo_align             ?? 'left',
    loading_logo_media_id: brand.loading_logo_media_id ?? null,
    pwa_icon_media_id:     brand.pwa_icon_media_id     ?? null,
    apple_touch_media_id:  brand.apple_touch_media_id  ?? null,
    og_image_media_id:     brand.og_image_media_id     ?? null,
    share_image_media_id:  brand.share_image_media_id  ?? null,
    splash_image_media_id: brand.splash_image_media_id ?? null,
    website_domain:    brand.website_domain   ?? '',
    api_domain:        brand.api_domain       ?? '',
    erp_domain:        brand.erp_domain       ?? '',
    auto_detect_domain: brand.auto_detect_domain ?? false,
    support_whatsapp:  brand.support_whatsapp  ?? '',
    support_telegram:  brand.support_telegram  ?? '',
    telegram_channel:  brand.telegram_channel  ?? '',
    facebook_url:      brand.facebook_url      ?? '',
    instagram_url:     brand.instagram_url     ?? '',
    tiktok_url:        brand.tiktok_url        ?? '',
    support_email:     brand.support_email     ?? '',
    support_phone:     brand.support_phone     ?? '',
    support_line:      brand.support_line      ?? '',
    support_wechat:    brand.support_wechat    ?? '',
    support_messenger: brand.support_messenger ?? '',
    support_discord:   brand.support_discord   ?? '',
    support_viber:     brand.support_viber     ?? '',
    support_x:         brand.support_x         ?? '',
    support_youtube:   brand.support_youtube   ?? '',
    seo_title:         brand.seo_title         ?? '',
    seo_description:   brand.seo_description   ?? '',
    seo_keywords:      brand.seo_keywords      ?? '',
    seo_author:        brand.seo_author        ?? '',
    canonical_url:     brand.canonical_url     ?? '',
    robots:            brand.robots            ?? 'index, follow',
    og_title:          brand.og_title          ?? '',
    og_description:    brand.og_description    ?? '',
    og_image_url:      brand.og_image_url      ?? '',
    twitter_card:        brand.twitter_card        ?? 'summary_large_image',
    twitter_title:       brand.twitter_title       ?? '',
    twitter_description: brand.twitter_description ?? '',
    twitter_image_url:   brand.twitter_image_url   ?? '',
    link_apk:           brand.link_apk           ?? '',
    link_ios:           brand.link_ios           ?? '',
    link_tg_bot:        brand.link_tg_bot        ?? '',
    link_tg_channel:    brand.link_tg_channel    ?? '',
    link_cs:            brand.link_cs            ?? '',
    link_referral_base: brand.link_referral_base ?? '',
    link_cdn:           brand.link_cdn           ?? '',
    link_promotion:     brand.link_promotion     ?? '',
    link_vip:           brand.link_vip           ?? '',
    sys_timezone: brand.sys_timezone ?? 'Asia/Kuala_Lumpur',
    sys_language: brand.sys_language ?? 'zh-CN',
    sys_country:  brand.sys_country  ?? 'MY',
    sys_locale:   brand.sys_locale   ?? 'ms-MY',
  };
}

export function buildSavePatch(form: FormState): Record<string, unknown> {
  const str = (v: string) => v.trim() || null;
  return {
    brand_name:        form.brand_name,
    company_name:      form.company_name,
    tagline:           str(form.tagline),
    short_name:        str(form.short_name),
    description:       str(form.description),
    website_name:      str(form.website_name),
    member_id_prefix:  form.member_id_prefix || 'SS',
    referral_prefix:   str(form.referral_prefix),
    primary_color:         form.primary_color         || '#1d4ed8',
    secondary_color:       form.secondary_color       || '#1e40af',
    theme_mode:            form.theme_mode            || 'light',
    color_bg:              form.color_bg              || '#0a0b14',
    color_card:            form.color_card            || '#111222',
    color_text:            form.color_text            || '#e8e8f5',
    logo_media_id:         form.logo_media_id         ?? null,
    favicon_media_id:      form.favicon_media_id      ?? null,
    logo_size:             form.logo_size             || 'medium',
    logo_align:            form.logo_align            || 'left',
    loading_logo_media_id: form.loading_logo_media_id ?? null,
    pwa_icon_media_id:     form.pwa_icon_media_id     ?? null,
    apple_touch_media_id:  form.apple_touch_media_id  ?? null,
    og_image_media_id:     form.og_image_media_id     ?? null,
    share_image_media_id:  form.share_image_media_id  ?? null,
    splash_image_media_id: form.splash_image_media_id ?? null,
    website_domain:    str(form.website_domain),
    api_domain:        str(form.api_domain),
    erp_domain:        str(form.erp_domain),
    auto_detect_domain: form.auto_detect_domain,
    support_whatsapp:  str(form.support_whatsapp),
    support_telegram:  str(form.support_telegram),
    telegram_channel:  str(form.telegram_channel),
    facebook_url:      str(form.facebook_url),
    instagram_url:     str(form.instagram_url),
    tiktok_url:        str(form.tiktok_url),
    support_email:     str(form.support_email),
    support_phone:     str(form.support_phone),
    support_line:      str(form.support_line),
    support_wechat:    str(form.support_wechat),
    support_messenger: str(form.support_messenger),
    support_discord:   str(form.support_discord),
    support_viber:     str(form.support_viber),
    support_x:         str(form.support_x),
    support_youtube:   str(form.support_youtube),
    seo_title:         str(form.seo_title),
    seo_description:   str(form.seo_description),
    seo_keywords:      str(form.seo_keywords),
    seo_author:        str(form.seo_author),
    canonical_url:     str(form.canonical_url),
    robots:            str(form.robots) ?? 'index, follow',
    og_title:          str(form.og_title),
    og_description:    str(form.og_description),
    og_image_url:      str(form.og_image_url),
    twitter_card:        str(form.twitter_card) ?? 'summary_large_image',
    twitter_title:       str(form.twitter_title),
    twitter_description: str(form.twitter_description),
    twitter_image_url:   str(form.twitter_image_url),
    link_apk:           str(form.link_apk),
    link_ios:           str(form.link_ios),
    link_tg_bot:        str(form.link_tg_bot),
    link_tg_channel:    str(form.link_tg_channel),
    link_cs:            str(form.link_cs),
    link_referral_base: str(form.link_referral_base),
    link_cdn:           str(form.link_cdn),
    link_promotion:     str(form.link_promotion),
    link_vip:           str(form.link_vip),
    sys_timezone: form.sys_timezone || 'Asia/Kuala_Lumpur',
    sys_language: form.sys_language || 'zh-CN',
    sys_country:  form.sys_country  || 'MY',
    sys_locale:   form.sys_locale   || 'ms-MY',
  };
}
