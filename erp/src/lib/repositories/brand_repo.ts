import pool from '@/lib/db';

export interface BrandSettings {
  id: number;
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
  erp_domain: string | null;
  support_whatsapp: string | null;
  support_telegram: string | null;
  telegram_channel: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  support_email: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  member_id_prefix: string;
  // Design System (Migration 051)
  design_preset: string;
  design_overrides: Record<string, string>;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export type BrandUpdate = Partial<Omit<BrandSettings, 'id' | 'created_at' | 'updated_at'>>;

// Columns available after Migration 024+025+048+051
const ALL_COLS = `
  id, brand_name, company_name, tagline,
  logo_media_id, favicon_media_id,
  COALESCE(logo_size,  'medium') AS logo_size,
  COALESCE(logo_align, 'left')   AS logo_align,
  primary_color, secondary_color, theme_mode,
  COALESCE(color_bg,   '#0a0b14') AS color_bg,
  COALESCE(color_card, '#111222') AS color_card,
  COALESCE(color_text, '#e8e8f5') AS color_text,
  website_domain, api_domain, erp_domain,
  support_whatsapp, support_telegram, telegram_channel, facebook_url,
  instagram_url, tiktok_url, support_email,
  seo_title, seo_description, seo_keywords,
  member_id_prefix,
  COALESCE(design_preset,    'classic_purple') AS design_preset,
  COALESCE(design_overrides, '{}')             AS design_overrides,
  created_at::text, updated_at::text, updated_by
`.trim();

// Fallback columns for deployments without Migration 024/025/048
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

// Columns added in Migration 024/025 that may not exist yet
const MIGRATION_024_COLS: (keyof BrandUpdate)[] = [
  'color_bg', 'color_card', 'color_text',
  'logo_size', 'logo_align',
];

// Columns added in Migration 048 that may not exist yet
const MIGRATION_048_COLS: (keyof BrandUpdate)[] = [
  'erp_domain', 'instagram_url', 'tiktok_url', 'support_email',
];

// Columns added in Migration 051 that may not exist yet
const MIGRATION_051_COLS: (keyof BrandUpdate)[] = [
  'design_preset', 'design_overrides',
];

// Keywords that appear in PostgreSQL "column does not exist" errors
const MIGRATION_COL_KEYWORDS = [
  'color_bg', 'color_card', 'color_text', 'logo_size', 'logo_align',
  'erp_domain', 'instagram_url', 'tiktok_url', 'support_email',
  'design_preset', 'design_overrides',
];

function isMigrationColumnError(msg: string): boolean {
  return MIGRATION_COL_KEYWORDS.some(k => msg.includes(k));
}

export const VALID_LOGO_SIZES  = new Set(['small', 'medium', 'large', 'xlarge']);
export const VALID_LOGO_ALIGNS = new Set(['left', 'center', 'right']);

function applyBrandDefaults(row: Record<string, unknown>): BrandSettings {
  return {
    ...row,
    color_bg:      (row.color_bg as string)      ?? '#0a0b14',
    color_card:    (row.color_card as string)    ?? '#111222',
    color_text:    (row.color_text as string)    ?? '#e8e8f5',
    logo_size:     (row.logo_size as string)     ?? 'medium',
    logo_align:    (row.logo_align as string)    ?? 'left',
    erp_domain:      (row.erp_domain as string)      ?? null,
    instagram_url:   (row.instagram_url as string)   ?? null,
    tiktok_url:      (row.tiktok_url as string)      ?? null,
    support_email:   (row.support_email as string)   ?? null,
    design_preset:   (row.design_preset as string)   ?? 'classic_purple',
    design_overrides:(row.design_overrides as Record<string, string>) ?? {},
  } as BrandSettings;
}

export async function getBrandSettings(): Promise<BrandSettings | null> {
  try {
    const r = await pool.query(`SELECT ${ALL_COLS} FROM brand_settings WHERE id = 1`);
    return r.rows[0] ?? null;
  } catch {
    // Migration 024/025/048 not yet applied — fall back to base columns only
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
    'logo_media_id', 'favicon_media_id',
    'logo_size', 'logo_align',
    'primary_color', 'secondary_color', 'theme_mode',
    'color_bg', 'color_card', 'color_text',
    'website_domain', 'api_domain', 'erp_domain',
    'support_whatsapp', 'support_telegram', 'telegram_channel', 'facebook_url',
    'instagram_url', 'tiktok_url', 'support_email',
    'seo_title', 'seo_description', 'seo_keywords',
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

  // Sanitize migration-column values to known-good defaults before hitting DB
  if ('logo_size'  in data && !VALID_LOGO_SIZES.has(data.logo_size  ?? '')) data = { ...data, logo_size:  'medium' };
  if ('logo_align' in data && !VALID_LOGO_ALIGNS.has(data.logo_align ?? '')) data = { ...data, logo_align: 'left' };

  try {
    const { sql, params } = buildQuery(ALLOWED_KEYS, ALL_COLS);
    const r = await pool.query(sql, params);
    if (r.rows.length === 0) throw new Error('brand_settings row not found — run migrations');
    return r.rows[0] as BrandSettings;
  } catch (err: unknown) {
    const msg = String((err as { message?: string }).message ?? err);
    // Migration columns missing — retry without them
    if (isMigrationColumnError(msg)) {
      console.warn('[brand_repo] Migration columns missing — retrying with compat keys');
      const compatKeys = ALLOWED_KEYS.filter(
        k => !MIGRATION_024_COLS.includes(k) && !MIGRATION_048_COLS.includes(k) && !MIGRATION_051_COLS.includes(k)
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
           facebook_url = NULL, seo_title = NULL, seo_description = NULL, seo_keywords = NULL,
           updated_by = $1
         WHERE id = 1 RETURNING ${ALL_COLS_COMPAT}`,
        [updatedBy]
      );
      if (r.rows.length === 0) throw new Error('brand_settings row not found');
      return applyBrandDefaults(r.rows[0] as Record<string, unknown>);
    }
    throw err;
  }
}
