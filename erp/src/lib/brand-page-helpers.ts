import type { BrandSettings } from '@/lib/repositories/brand_repo';

export type FormState = {
  brand_name: string;
  company_name: string;
  tagline: string;
  member_id_prefix: string;
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
  website_domain: string;
  api_domain: string;
  erp_domain: string;
  support_whatsapp: string;
  support_telegram: string;
  telegram_channel: string;
  facebook_url: string;
  instagram_url: string;
  tiktok_url: string;
  support_email: string;
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
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
    tagline:           brand.tagline ?? '',
    member_id_prefix:  brand.member_id_prefix ?? 'SS',
    logo_media_id:     brand.logo_media_id,
    favicon_media_id:  brand.favicon_media_id,
    logo_size:         brand.logo_size  ?? 'medium',
    logo_align:        brand.logo_align ?? 'left',
    primary_color:     brand.primary_color,
    secondary_color:   brand.secondary_color,
    theme_mode:        brand.theme_mode,
    color_bg:          brand.color_bg   ?? '#0a0b14',
    color_card:        brand.color_card ?? '#111222',
    color_text:        brand.color_text ?? '#e8e8f5',
    website_domain:    brand.website_domain   ?? '',
    api_domain:        brand.api_domain       ?? '',
    erp_domain:        brand.erp_domain       ?? '',
    support_whatsapp:  brand.support_whatsapp ?? '',
    support_telegram:  brand.support_telegram ?? '',
    telegram_channel:  brand.telegram_channel ?? '',
    facebook_url:      brand.facebook_url     ?? '',
    instagram_url:     brand.instagram_url    ?? '',
    tiktok_url:        brand.tiktok_url       ?? '',
    support_email:     brand.support_email    ?? '',
    seo_title:         brand.seo_title        ?? '',
    seo_description:   brand.seo_description  ?? '',
    seo_keywords:      brand.seo_keywords     ?? '',
  };
}

export function buildSavePatch(form: FormState): Record<string, unknown> {
  return {
    brand_name:       form.brand_name,
    company_name:     form.company_name,
    tagline:          form.tagline || null,
    member_id_prefix: form.member_id_prefix || 'SS',
    logo_media_id:    form.logo_media_id ?? null,
    favicon_media_id: form.favicon_media_id ?? null,
    logo_size:        form.logo_size  || 'medium',
    logo_align:       form.logo_align || 'left',
    primary_color:    form.primary_color,
    secondary_color:  form.secondary_color,
    theme_mode:       form.theme_mode,
    color_bg:         form.color_bg   || '#0a0b14',
    color_card:       form.color_card || '#111222',
    color_text:       form.color_text || '#e8e8f5',
    website_domain:   form.website_domain   || null,
    api_domain:       form.api_domain       || null,
    erp_domain:       form.erp_domain       || null,
    support_whatsapp: form.support_whatsapp || null,
    support_telegram: form.support_telegram || null,
    telegram_channel: form.telegram_channel || null,
    facebook_url:     form.facebook_url     || null,
    instagram_url:    form.instagram_url    || null,
    tiktok_url:       form.tiktok_url       || null,
    support_email:    form.support_email    || null,
    seo_title:        form.seo_title        || null,
    seo_description:  form.seo_description  || null,
    seo_keywords:     form.seo_keywords     || null,
  };
}
