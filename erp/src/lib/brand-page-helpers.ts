import type { BrandSettings } from '@/lib/repositories/brand_repo';

export type FormState = {
  brand_name: string;
  company_name: string;
  tagline: string;
  logo_media_id: number | null;
  favicon_media_id: number | null;
  primary_color: string;
  secondary_color: string;
  theme_mode: string;
  website_domain: string;
  api_domain: string;
  support_whatsapp: string;
  support_telegram: string;
  telegram_channel: string;
  facebook_url: string;
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
    brand_name:       brand.brand_name,
    company_name:     brand.company_name,
    tagline:          brand.tagline ?? '',
    logo_media_id:    brand.logo_media_id,
    favicon_media_id: brand.favicon_media_id,
    primary_color:    brand.primary_color,
    secondary_color:  brand.secondary_color,
    theme_mode:       brand.theme_mode,
    website_domain:   brand.website_domain ?? '',
    api_domain:       brand.api_domain ?? '',
    support_whatsapp: brand.support_whatsapp ?? '',
    support_telegram: brand.support_telegram ?? '',
    telegram_channel: brand.telegram_channel ?? '',
    facebook_url:     brand.facebook_url ?? '',
    seo_title:        brand.seo_title ?? '',
    seo_description:  brand.seo_description ?? '',
    seo_keywords:     brand.seo_keywords ?? '',
  };
}

export function buildSavePatch(form: FormState): Record<string, unknown> {
  return {
    brand_name:       form.brand_name,
    company_name:     form.company_name,
    tagline:          form.tagline || null,
    logo_media_id:    form.logo_media_id ?? null,
    favicon_media_id: form.favicon_media_id ?? null,
    primary_color:    form.primary_color,
    secondary_color:  form.secondary_color,
    theme_mode:       form.theme_mode,
    website_domain:   form.website_domain || null,
    api_domain:       form.api_domain || null,
    support_whatsapp: form.support_whatsapp || null,
    support_telegram: form.support_telegram || null,
    telegram_channel: form.telegram_channel || null,
    facebook_url:     form.facebook_url || null,
    seo_title:        form.seo_title || null,
    seo_description:  form.seo_description || null,
    seo_keywords:     form.seo_keywords || null,
  };
}
