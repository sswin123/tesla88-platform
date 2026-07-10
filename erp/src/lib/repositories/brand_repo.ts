import pool from '@/lib/db';

export interface BrandSettings {
  id: number;
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
  member_id_prefix: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export type BrandUpdate = Partial<Omit<BrandSettings, 'id' | 'created_at' | 'updated_at'>>;

const ALL_COLS = `
  id, brand_name, company_name, tagline,
  logo_media_id, favicon_media_id,
  primary_color, secondary_color, theme_mode,
  website_domain, api_domain,
  support_whatsapp, support_telegram, telegram_channel, facebook_url,
  seo_title, seo_description, seo_keywords,
  member_id_prefix,
  created_at::text, updated_at::text, updated_by
`.trim();

export async function getBrandSettings(): Promise<BrandSettings | null> {
  const r = await pool.query(`SELECT ${ALL_COLS} FROM brand_settings WHERE id = 1`);
  return r.rows[0] ?? null;
}

export async function updateBrandSettings(
  data: BrandUpdate,
  updatedBy: string
): Promise<BrandSettings> {
  const ALLOWED_KEYS: (keyof BrandUpdate)[] = [
    'brand_name', 'company_name', 'tagline',
    'logo_media_id', 'favicon_media_id',
    'primary_color', 'secondary_color', 'theme_mode',
    'website_domain', 'api_domain',
    'support_whatsapp', 'support_telegram', 'telegram_channel', 'facebook_url',
    'seo_title', 'seo_description', 'seo_keywords',
    'member_id_prefix',
  ];

  const fields: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  for (const key of ALLOWED_KEYS) {
    if (key in data) {
      fields.push(`${key} = $${i++}`);
      params.push((data as Record<string, unknown>)[key] ?? null);
    }
  }

  fields.push(`updated_by = $${i++}`);
  params.push(updatedBy);

  const r = await pool.query(
    `UPDATE brand_settings SET ${fields.join(', ')} WHERE id = 1 RETURNING ${ALL_COLS}`,
    params
  );

  if (r.rows.length === 0) {
    throw new Error('brand_settings row not found — run migration 034');
  }
  return r.rows[0];
}

export async function bumpBrandCacheVersion(): Promise<void> {
  await pool.query(
    `UPDATE cache_versions SET version = version + 1, updated_at = NOW()
     WHERE component = 'brand_settings'`
  );
}

export async function resetBrandSettings(updatedBy: string): Promise<BrandSettings> {
  const r = await pool.query(
    `UPDATE brand_settings SET
       brand_name = 'SSWIN88', company_name = 'SSWIN88', tagline = NULL,
       logo_media_id = NULL, favicon_media_id = NULL,
       primary_color = '#1d4ed8', secondary_color = '#1e40af', theme_mode = 'light',
       website_domain = NULL, api_domain = NULL,
       support_whatsapp = NULL, support_telegram = NULL, telegram_channel = NULL,
       facebook_url = NULL, seo_title = NULL, seo_description = NULL, seo_keywords = NULL,
       updated_by = $1
     WHERE id = 1 RETURNING ${ALL_COLS}`,
    [updatedBy]
  );
  if (r.rows.length === 0) throw new Error('brand_settings row not found');
  return r.rows[0];
}
