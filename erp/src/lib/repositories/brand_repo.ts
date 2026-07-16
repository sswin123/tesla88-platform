import pool from '@/lib/db';

export interface BrandSettings {
  id: number;
  // Brand Identity
  brand_name: string;
  company_name: string;
  tagline: string | null;
  short_name: string | null;
  description: string | null;
  website_name: string | null;
  member_id_prefix: string;
  referral_prefix: string | null;
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
  // Theme (managed in Design System)
  primary_color: string;
  secondary_color: string;
  theme_mode: string;
  color_bg: string;
  color_card: string;
  color_text: string;
  // Domain
  website_domain: string | null;
  api_domain: string | null;
  erp_domain: string | null;
  auto_detect_domain: boolean;
  // Contact
  support_whatsapp: string | null;
  support_telegram: string | null;
  telegram_channel: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  support_email: string | null;
  support_line: string | null;
  support_wechat: string | null;
  support_messenger: string | null;
  support_discord: string | null;
  support_viber: string | null;
  support_x: string | null;
  support_youtube: string | null;
  // SEO: Basic
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  seo_author: string | null;
  canonical_url: string | null;
  robots: string | null;
  // SEO: Open Graph
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  // SEO: Twitter Card
  twitter_card: string | null;
  twitter_title: string | null;
  twitter_description: string | null;
  twitter_image_url: string | null;
  // Brand Links
  link_apk: string | null;
  link_ios: string | null;
  link_tg_bot: string | null;
  link_tg_channel: string | null;
  link_cs: string | null;
  link_referral_base: string | null;
  link_cdn: string | null;
  link_promotion: string | null;
  link_vip: string | null;
  // System Information
  sys_timezone: string | null;
  sys_language: string | null;
  sys_country: string | null;
  sys_locale: string | null;
  // Design System (Migration 051)
  design_preset: string;
  design_overrides: Record<string, string>;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export type BrandUpdate = Partial<Omit<BrandSettings, 'id' | 'created_at' | 'updated_at'>>;

// Columns available after all migrations
const ALL_COLS = `
  id, brand_name, company_name, tagline,
  COALESCE(short_name, '')  AS short_name,
  COALESCE(description, '') AS description,
  COALESCE(website_name, '') AS website_name,
  member_id_prefix,
  COALESCE(referral_prefix, '') AS referral_prefix,
  logo_media_id, favicon_media_id,
  COALESCE(logo_size,  'medium') AS logo_size,
  COALESCE(logo_align, 'left')   AS logo_align,
  loading_logo_media_id, pwa_icon_media_id, apple_touch_media_id,
  og_image_media_id, share_image_media_id, splash_image_media_id,
  primary_color, secondary_color, theme_mode,
  COALESCE(color_bg,   '#0a0b14') AS color_bg,
  COALESCE(color_card, '#111222') AS color_card,
  COALESCE(color_text, '#e8e8f5') AS color_text,
  website_domain, api_domain, erp_domain,
  COALESCE(auto_detect_domain, FALSE) AS auto_detect_domain,
  support_whatsapp, support_telegram, telegram_channel, facebook_url,
  instagram_url, tiktok_url, support_email,
  support_line, support_wechat, support_messenger,
  support_discord, support_viber, support_x, support_youtube,
  seo_title, seo_description, seo_keywords, seo_author,
  canonical_url, COALESCE(robots, 'index, follow') AS robots,
  og_title, og_description, og_image_url,
  COALESCE(twitter_card, 'summary_large_image') AS twitter_card,
  twitter_title, twitter_description, twitter_image_url,
  link_apk, link_ios, link_tg_bot, link_tg_channel, link_cs,
  link_referral_base, link_cdn, link_promotion, link_vip,
  COALESCE(sys_timezone, 'Asia/Kuala_Lumpur') AS sys_timezone,
  COALESCE(sys_language, 'zh-CN')            AS sys_language,
  COALESCE(sys_country,  'MY')               AS sys_country,
  COALESCE(sys_locale,   'ms-MY')            AS sys_locale,
  COALESCE(design_preset,    'classic_purple') AS design_preset,
  COALESCE(design_overrides, '{}')             AS design_overrides,
  created_at::text, updated_at::text, updated_by
`.trim();

// Fallback columns for deployments without newer migrations
const ALL_COLS_COMPAT = `
  id, brand_name, company_name, tagline,
  logo_media_id, favicon_media_id,
  primary_color, secondary_color, theme_mode,
  website_domain, api_domain,
  support_whatsapp, support_telegram, telegram_channel, facebook_url,
  seo_title, seo_description, seo_keywords,
  member_id_prefix,
  created_at::text, updated_at::text, updated_by
`.trim();

// New columns added in Migration 053
const MIGRATION_053_COLS: (keyof BrandUpdate)[] = [
  'referral_prefix', 'website_name', 'short_name', 'description',
  'loading_logo_media_id', 'pwa_icon_media_id', 'apple_touch_media_id',
  'og_image_media_id', 'share_image_media_id', 'splash_image_media_id',
  'auto_detect_domain',
  'support_line', 'support_wechat', 'support_messenger', 'support_discord',
  'support_viber', 'support_x', 'support_youtube',
  'og_title', 'og_description', 'og_image_url',
  'twitter_card', 'twitter_title', 'twitter_description', 'twitter_image_url',
  'canonical_url', 'robots', 'seo_author',
  'link_apk', 'link_ios', 'link_tg_bot', 'link_tg_channel', 'link_cs',
  'link_referral_base', 'link_cdn', 'link_promotion', 'link_vip',
  'sys_timezone', 'sys_language', 'sys_country', 'sys_locale',
];

const MIGRATION_051_COLS: (keyof BrandUpdate)[] = ['design_preset', 'design_overrides'];
const MIGRATION_048_COLS: (keyof BrandUpdate)[] = ['erp_domain', 'instagram_url', 'tiktok_url', 'support_email'];
const MIGRATION_024_COLS: (keyof BrandUpdate)[] = ['color_bg', 'color_card', 'color_text', 'logo_size', 'logo_align'];

const MIGRATION_COL_KEYWORDS = [
  'color_bg', 'color_card', 'color_text', 'logo_size', 'logo_align',
  'erp_domain', 'instagram_url', 'tiktok_url', 'support_email',
  'design_preset', 'design_overrides',
  'referral_prefix', 'website_name', 'short_name', 'auto_detect_domain',
  'loading_logo_media_id', 'pwa_icon_media_id', 'apple_touch_media_id',
  'og_image_media_id', 'share_image_media_id', 'splash_image_media_id',
  'support_line', 'support_wechat', 'support_messenger', 'support_discord',
  'support_viber', 'support_x', 'support_youtube',
  'og_title', 'og_description', 'og_image_url',
  'twitter_card', 'twitter_title', 'twitter_description', 'twitter_image_url',
  'canonical_url', 'robots', 'seo_author',
  'link_apk', 'link_ios', 'link_tg_bot', 'link_tg_channel', 'link_cs',
  'link_referral_base', 'link_cdn', 'link_promotion', 'link_vip',
  'sys_timezone', 'sys_language', 'sys_country', 'sys_locale',
];

function isMigrationColumnError(msg: string): boolean {
  return MIGRATION_COL_KEYWORDS.some(k => msg.includes(k));
}

export const VALID_LOGO_SIZES  = new Set(['small', 'medium', 'large', 'xlarge']);
export const VALID_LOGO_ALIGNS = new Set(['left', 'center', 'right']);

function applyBrandDefaults(row: Record<string, unknown>): BrandSettings {
  return {
    ...row,
    short_name:        (row.short_name as string)        ?? null,
    description:       (row.description as string)       ?? null,
    website_name:      (row.website_name as string)      ?? null,
    referral_prefix:   (row.referral_prefix as string)   ?? null,
    color_bg:      (row.color_bg as string)      ?? '#0a0b14',
    color_card:    (row.color_card as string)    ?? '#111222',
    color_text:    (row.color_text as string)    ?? '#e8e8f5',
    logo_size:     (row.logo_size as string)     ?? 'medium',
    logo_align:    (row.logo_align as string)    ?? 'left',
    loading_logo_media_id: (row.loading_logo_media_id as number) ?? null,
    pwa_icon_media_id:     (row.pwa_icon_media_id as number)     ?? null,
    apple_touch_media_id:  (row.apple_touch_media_id as number)  ?? null,
    og_image_media_id:     (row.og_image_media_id as number)     ?? null,
    share_image_media_id:  (row.share_image_media_id as number)  ?? null,
    splash_image_media_id: (row.splash_image_media_id as number) ?? null,
    erp_domain:      (row.erp_domain as string)      ?? null,
    instagram_url:   (row.instagram_url as string)   ?? null,
    tiktok_url:      (row.tiktok_url as string)      ?? null,
    support_email:   (row.support_email as string)   ?? null,
    auto_detect_domain: (row.auto_detect_domain as boolean) ?? false,
    support_line:      (row.support_line as string)      ?? null,
    support_wechat:    (row.support_wechat as string)    ?? null,
    support_messenger: (row.support_messenger as string) ?? null,
    support_discord:   (row.support_discord as string)   ?? null,
    support_viber:     (row.support_viber as string)     ?? null,
    support_x:         (row.support_x as string)         ?? null,
    support_youtube:   (row.support_youtube as string)   ?? null,
    og_title:          (row.og_title as string)          ?? null,
    og_description:    (row.og_description as string)    ?? null,
    og_image_url:      (row.og_image_url as string)      ?? null,
    twitter_card:        (row.twitter_card as string)        ?? 'summary_large_image',
    twitter_title:       (row.twitter_title as string)       ?? null,
    twitter_description: (row.twitter_description as string) ?? null,
    twitter_image_url:   (row.twitter_image_url as string)   ?? null,
    canonical_url:     (row.canonical_url as string)     ?? null,
    robots:            (row.robots as string)            ?? 'index, follow',
    seo_author:        (row.seo_author as string)        ?? null,
    link_apk:           (row.link_apk as string)           ?? null,
    link_ios:           (row.link_ios as string)           ?? null,
    link_tg_bot:        (row.link_tg_bot as string)        ?? null,
    link_tg_channel:    (row.link_tg_channel as string)    ?? null,
    link_cs:            (row.link_cs as string)            ?? null,
    link_referral_base: (row.link_referral_base as string) ?? null,
    link_cdn:           (row.link_cdn as string)           ?? null,
    link_promotion:     (row.link_promotion as string)     ?? null,
    link_vip:           (row.link_vip as string)           ?? null,
    sys_timezone: (row.sys_timezone as string) ?? 'Asia/Kuala_Lumpur',
    sys_language: (row.sys_language as string) ?? 'zh-CN',
    sys_country:  (row.sys_country as string)  ?? 'MY',
    sys_locale:   (row.sys_locale as string)   ?? 'ms-MY',
    design_preset:   (row.design_preset as string)   ?? 'classic_purple',
    design_overrides:(row.design_overrides as Record<string, string>) ?? {},
  } as BrandSettings;
}

export async function getBrandSettings(): Promise<BrandSettings | null> {
  try {
    const r = await pool.query(`SELECT ${ALL_COLS} FROM brand_settings WHERE id = 1`);
    return r.rows[0] ?? null;
  } catch {
    try {
      const r = await pool.query(`SELECT ${ALL_COLS_COMPAT} FROM brand_settings WHERE id = 1`);
      if (!r.rows[0]) return null;
      return applyBrandDefaults(r.rows[0] as Record<string, unknown>);
    } catch (e2) {
      console.error('[brand_repo] getBrandSettings fallback failed:', e2);
      return null;
    }
  }
}

export async function updateBrandSettings(
  data: BrandUpdate,
  updatedBy: string
): Promise<BrandSettings> {
  const ALLOWED_KEYS: (keyof BrandUpdate)[] = [
    'brand_name', 'company_name', 'tagline',
    'short_name', 'description', 'website_name', 'referral_prefix',
    'logo_media_id', 'favicon_media_id',
    'logo_size', 'logo_align',
    'loading_logo_media_id', 'pwa_icon_media_id', 'apple_touch_media_id',
    'og_image_media_id', 'share_image_media_id', 'splash_image_media_id',
    'primary_color', 'secondary_color', 'theme_mode',
    'color_bg', 'color_card', 'color_text',
    'website_domain', 'api_domain', 'erp_domain', 'auto_detect_domain',
    'support_whatsapp', 'support_telegram', 'telegram_channel', 'facebook_url',
    'instagram_url', 'tiktok_url', 'support_email',
    'support_line', 'support_wechat', 'support_messenger', 'support_discord',
    'support_viber', 'support_x', 'support_youtube',
    'seo_title', 'seo_description', 'seo_keywords', 'seo_author',
    'canonical_url', 'robots',
    'og_title', 'og_description', 'og_image_url',
    'twitter_card', 'twitter_title', 'twitter_description', 'twitter_image_url',
    'link_apk', 'link_ios', 'link_tg_bot', 'link_tg_channel', 'link_cs',
    'link_referral_base', 'link_cdn', 'link_promotion', 'link_vip',
    'sys_timezone', 'sys_language', 'sys_country', 'sys_locale',
    'member_id_prefix',
    'design_preset', 'design_overrides',
  ];

  function buildQuery(keys: (keyof BrandUpdate)[], cols: string) {
    const fields: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const key of keys) {
      if (key in data) {
        fields.push(`${key} = $${i++}`);
        params.push((data as Record<string, unknown>)[key] ?? null);
      }
    }
    fields.push(`updated_by = $${i++}`);
    params.push(updatedBy);
    return {
      sql: `UPDATE brand_settings SET ${fields.join(', ')} WHERE id = 1 RETURNING ${cols}`,
      params,
    };
  }

  if ('logo_size'  in data && !VALID_LOGO_SIZES.has(data.logo_size  ?? '')) data = { ...data, logo_size:  'medium' };
  if ('logo_align' in data && !VALID_LOGO_ALIGNS.has(data.logo_align ?? '')) data = { ...data, logo_align: 'left' };

  try {
    const { sql, params } = buildQuery(ALLOWED_KEYS, ALL_COLS);
    const r = await pool.query(sql, params);
    if (r.rows.length === 0) throw new Error('brand_settings row not found — run migrations');
    return r.rows[0] as BrandSettings;
  } catch (err: unknown) {
    const msg = String((err as { message?: string }).message ?? err);
    if (isMigrationColumnError(msg)) {
      console.warn('[brand_repo] Migration columns missing — retrying with compat keys');
      const compatKeys = ALLOWED_KEYS.filter(
        k => !MIGRATION_024_COLS.includes(k) &&
             !MIGRATION_048_COLS.includes(k) &&
             !MIGRATION_051_COLS.includes(k) &&
             !MIGRATION_053_COLS.includes(k)
      );
      const { sql, params } = buildQuery(compatKeys, ALL_COLS_COMPAT);
      const r = await pool.query(sql, params);
      if (r.rows.length === 0) throw new Error('brand_settings row not found — run migrations');
      return applyBrandDefaults(r.rows[0] as Record<string, unknown>);
    }
    throw err;
  }
}

export async function bumpBrandCacheVersion(): Promise<void> {
  await pool.query(
    `UPDATE cache_versions SET version = version + 1, updated_at = NOW()
     WHERE component = 'brand_settings'`
  );
}

export async function resetBrandSettings(updatedBy: string): Promise<BrandSettings> {
  try {
    const r = await pool.query(
      `UPDATE brand_settings SET
         brand_name = '', company_name = '', tagline = NULL,
         logo_media_id = NULL, favicon_media_id = NULL,
         logo_size = 'medium', logo_align = 'left',
         primary_color = '#1d4ed8', secondary_color = '#1e40af', theme_mode = 'light',
         color_bg = '#0a0b14', color_card = '#111222', color_text = '#e8e8f5',
         website_domain = NULL, api_domain = NULL, erp_domain = NULL,
         support_whatsapp = NULL, support_telegram = NULL, telegram_channel = NULL,
         facebook_url = NULL, instagram_url = NULL, tiktok_url = NULL,
         support_email = NULL,
         seo_title = NULL, seo_description = NULL, seo_keywords = NULL,
         updated_by = $1
       WHERE id = 1 RETURNING ${ALL_COLS}`,
      [updatedBy]
    );
    if (r.rows.length === 0) throw new Error('brand_settings row not found');
    return r.rows[0] as BrandSettings;
  } catch (err: unknown) {
    const msg = String((err as { message?: string }).message ?? err);
    if (isMigrationColumnError(msg)) {
      const r = await pool.query(
        `UPDATE brand_settings SET
           brand_name = '', company_name = '', tagline = NULL,
           logo_media_id = NULL, favicon_media_id = NULL,
           primary_color = '#1d4ed8', secondary_color = '#1e40af', theme_mode = 'light',
           website_domain = NULL, api_domain = NULL,
           support_whatsapp = NULL, support_telegram = NULL, telegram_channel = NULL,
           facebook_url = NULL, seo_title = NULL, seo_description = NULL,
           seo_keywords = NULL, updated_by = $1
         WHERE id = 1 RETURNING ${ALL_COLS_COMPAT}`,
        [updatedBy]
      );
      if (r.rows.length === 0) throw new Error('brand_settings row not found');
      return applyBrandDefaults(r.rows[0] as Record<string, unknown>);
    }
    throw err;
  }
}
