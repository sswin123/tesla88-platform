// erp/src/lib/repositories/partner_repo.ts
// Phase M5-A — Partner Builder Repository Layer
import pool from '@/lib/db';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface PartnerTemplate {
  id: number;
  name: string;
  slug: string;
  version: string;
  description: string | null;
  preview_url: string | null;
  layout_json: Record<string, unknown>;
  default_theme_slug: string | null;
  tags: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface PartnerTheme {
  id: number;
  name: string;
  slug: string;
  preview_color: string;
  preview_gradient: string | null;
  css_variables: Record<string, string>;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface PartnerSite {
  id: number;
  name: string;
  slug: string;
  page_type: string;
  template_id: number;
  template_version: string;
  theme_id: number;
  logo_media_id: number | null;
  banner_media_id: number | null;
  favicon_media_id: number | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  seo_image_media_id: number | null;
  custom_css_vars: Record<string, string> | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  published_at: string | null;
  created_by: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  template_name?: string;
  template_slug?: string;
  theme_name?: string;
  theme_slug?: string;
}

export interface PartnerSection {
  id: number;
  site_id: number;
  section_type: string;
  content_json: Record<string, unknown>;
  sort_order: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface PartnerCard {
  id: number;
  site_id: number;
  logo_media_id: number | null;
  brand_name: string;
  subtitle: string | null;
  description: string | null;
  badge: string | null;
  welcome_bonus: string | null;
  free_credit: string | null;
  commission: string | null;
  promo_text: string | null;
  telegram_url: string | null;
  whatsapp_url: string | null;
  website_url: string | null;
  button_text: string;
  button_color: string | null;
  button_style: string;
  card_bg_color: string | null;
  card_bg_media_id: number | null;
  sort_order: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSiteInput {
  name: string;
  slug: string;
  page_type?: string;
  template_id: number;
  template_version?: string;
  theme_id: number;
  logo_media_id?: number | null;
  banner_media_id?: number | null;
  favicon_media_id?: number | null;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_keywords?: string | null;
  seo_image_media_id?: number | null;
  custom_css_vars?: Record<string, string> | null;
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  created_by?: number;
}

export interface UpdateSiteInput {
  name?: string;
  slug?: string;
  page_type?: string;
  template_id?: number;
  template_version?: string;
  theme_id?: number;
  logo_media_id?: number | null;
  banner_media_id?: number | null;
  favicon_media_id?: number | null;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_keywords?: string | null;
  seo_image_media_id?: number | null;
  custom_css_vars?: Record<string, string> | null;
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

export interface CreateCardInput {
  site_id: number;
  brand_name: string;
  logo_media_id?: number | null;
  subtitle?: string | null;
  description?: string | null;
  badge?: string | null;
  welcome_bonus?: string | null;
  free_credit?: string | null;
  commission?: string | null;
  promo_text?: string | null;
  telegram_url?: string | null;
  whatsapp_url?: string | null;
  website_url?: string | null;
  button_text?: string;
  button_color?: string | null;
  button_style?: string;
  card_bg_color?: string | null;
  card_bg_media_id?: number | null;
  sort_order?: number;
}

export interface UpdateCardInput {
  logo_media_id?: number | null;
  brand_name?: string;
  subtitle?: string | null;
  description?: string | null;
  badge?: string | null;
  welcome_bonus?: string | null;
  free_credit?: string | null;
  commission?: string | null;
  promo_text?: string | null;
  telegram_url?: string | null;
  whatsapp_url?: string | null;
  website_url?: string | null;
  button_text?: string;
  button_color?: string | null;
  button_style?: string;
  card_bg_color?: string | null;
  card_bg_media_id?: number | null;
  sort_order?: number;
  is_enabled?: boolean;
}

export interface CreateSectionInput {
  site_id: number;
  section_type: string;
  content_json?: Record<string, unknown>;
  sort_order?: number;
  is_enabled?: boolean;
}

export interface UpdateSectionInput {
  section_type?: string;
  content_json?: Record<string, unknown>;
  sort_order?: number;
  is_enabled?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════════════════════════

export async function getAllTemplates(): Promise<PartnerTemplate[]> {
  const { rows } = await pool.query<PartnerTemplate>(
    `SELECT * FROM partner_templates
     WHERE is_active = TRUE
     ORDER BY sort_order ASC, id ASC`
  );
  return rows;
}

export async function getTemplateBySlug(slug: string, version = 'v1'): Promise<PartnerTemplate | null> {
  const { rows } = await pool.query<PartnerTemplate>(
    `SELECT * FROM partner_templates WHERE slug = $1 AND version = $2`,
    [slug, version]
  );
  return rows[0] ?? null;
}

export async function getTemplateById(id: number): Promise<PartnerTemplate | null> {
  const { rows } = await pool.query<PartnerTemplate>(
    `SELECT * FROM partner_templates WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

// ═══════════════════════════════════════════════════════════════
// THEMES
// ═══════════════════════════════════════════════════════════════

export async function getAllThemes(): Promise<PartnerTheme[]> {
  const { rows } = await pool.query<PartnerTheme>(
    `SELECT * FROM partner_themes
     WHERE is_active = TRUE
     ORDER BY sort_order ASC, id ASC`
  );
  return rows;
}

export async function getThemeBySlug(slug: string): Promise<PartnerTheme | null> {
  const { rows } = await pool.query<PartnerTheme>(
    `SELECT * FROM partner_themes WHERE slug = $1`,
    [slug]
  );
  return rows[0] ?? null;
}

export async function getThemeById(id: number): Promise<PartnerTheme | null> {
  const { rows } = await pool.query<PartnerTheme>(
    `SELECT * FROM partner_themes WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function updateTheme(
  id: number,
  data: { name?: string; preview_color?: string; preview_gradient?: string | null; css_variables?: Record<string, string> }
): Promise<PartnerTheme | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if ('name'             in data) { fields.push(`name = $${i++}`);             values.push(data.name); }
  if ('preview_color'    in data) { fields.push(`preview_color = $${i++}`);    values.push(data.preview_color); }
  if ('preview_gradient' in data) { fields.push(`preview_gradient = $${i++}`); values.push(data.preview_gradient ?? null); }
  if ('css_variables'    in data) { fields.push(`css_variables = $${i++}`);    values.push(JSON.stringify(data.css_variables)); }
  if (fields.length === 0) return getThemeById(id);
  values.push(id);
  const { rows } = await pool.query<PartnerTheme>(
    `UPDATE partner_themes SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return rows[0] ?? null;
}

// ═══════════════════════════════════════════════════════════════
// SITES
// ═══════════════════════════════════════════════════════════════

export async function getAllSites(): Promise<PartnerSite[]> {
  const { rows } = await pool.query<PartnerSite>(
    `SELECT
       ps.*,
       pt.name  AS template_name,
       pt.slug  AS template_slug,
       pth.name AS theme_name,
       pth.slug AS theme_slug
     FROM partner_sites ps
     LEFT JOIN partner_templates pt  ON pt.id = ps.template_id
     LEFT JOIN partner_themes    pth ON pth.id = ps.theme_id
     WHERE ps.deleted_at IS NULL
     ORDER BY ps.updated_at DESC`
  );
  return rows;
}

export async function getSiteById(id: number): Promise<PartnerSite | null> {
  const { rows } = await pool.query<PartnerSite>(
    `SELECT
       ps.*,
       pt.name  AS template_name,
       pt.slug  AS template_slug,
       pth.name AS theme_name,
       pth.slug AS theme_slug
     FROM partner_sites ps
     LEFT JOIN partner_templates pt  ON pt.id = ps.template_id
     LEFT JOIN partner_themes    pth ON pth.id = ps.theme_id
     WHERE ps.id = $1 AND ps.deleted_at IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

export async function getSiteBySlug(slug: string): Promise<PartnerSite | null> {
  const { rows } = await pool.query<PartnerSite>(
    `SELECT
       ps.*,
       pt.name  AS template_name,
       pt.slug  AS template_slug,
       pth.name AS theme_name,
       pth.slug AS theme_slug
     FROM partner_sites ps
     LEFT JOIN partner_templates pt  ON pt.id = ps.template_id
     LEFT JOIN partner_themes    pth ON pth.id = ps.theme_id
     WHERE ps.slug = $1 AND ps.deleted_at IS NULL`,
    [slug]
  );
  return rows[0] ?? null;
}

export async function createSite(data: CreateSiteInput): Promise<PartnerSite> {
  const { rows } = await pool.query<PartnerSite>(
    `INSERT INTO partner_sites
       (name, slug, page_type, template_id, template_version, theme_id,
        logo_media_id, banner_media_id, favicon_media_id,
        seo_title, seo_description, seo_keywords, seo_image_media_id,
        custom_css_vars, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [
      data.name,
      data.slug,
      data.page_type ?? 'partner',
      data.template_id,
      data.template_version ?? 'v1',
      data.theme_id,
      data.logo_media_id ?? null,
      data.banner_media_id ?? null,
      data.favicon_media_id ?? null,
      data.seo_title ?? null,
      data.seo_description ?? null,
      data.seo_keywords ?? null,
      data.seo_image_media_id ?? null,
      data.custom_css_vars ? JSON.stringify(data.custom_css_vars) : null,
      data.status ?? 'DRAFT',
      data.created_by ?? null,
    ]
  );
  return rows[0];
}

export async function updateSite(id: number, data: UpdateSiteInput): Promise<PartnerSite | null> {
  const allowed: (keyof UpdateSiteInput)[] = [
    'name','slug','page_type','template_id','template_version','theme_id',
    'logo_media_id','banner_media_id','favicon_media_id',
    'seo_title','seo_description','seo_keywords','seo_image_media_id',
    'custom_css_vars','status',
  ];
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const key of allowed) {
    if (key in data) {
      fields.push(`${key} = $${i++}`);
      const v = data[key];
      values.push(
        key === 'custom_css_vars' && v != null ? JSON.stringify(v) : (v ?? null)
      );
    }
  }
  if (fields.length === 0) return getSiteById(id);
  values.push(id);
  const { rows } = await pool.query<PartnerSite>(
    `UPDATE partner_sites SET ${fields.join(', ')} WHERE id = $${i} AND deleted_at IS NULL RETURNING *`,
    values
  );
  return rows[0] ?? null;
}

export async function publishSite(id: number, publish: boolean): Promise<PartnerSite | null> {
  const { rows } = await pool.query<PartnerSite>(
    `UPDATE partner_sites
     SET status = $1, published_at = $2
     WHERE id = $3 AND deleted_at IS NULL
     RETURNING *`,
    [
      publish ? 'PUBLISHED' : 'DRAFT',
      publish ? new Date().toISOString() : null,
      id,
    ]
  );
  return rows[0] ?? null;
}

export async function softDeleteSite(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE partner_sites SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return (rowCount ?? 0) > 0;
}

export async function duplicateSite(
  id: number,
  newName: string,
  newSlug: string,
  createdBy?: number
): Promise<PartnerSite | null> {
  const original = await getSiteById(id);
  if (!original) return null;

  const { rows } = await pool.query<PartnerSite>(
    `INSERT INTO partner_sites
       (name, slug, page_type, template_id, template_version, theme_id,
        logo_media_id, banner_media_id, favicon_media_id,
        seo_title, seo_description, seo_keywords, seo_image_media_id,
        custom_css_vars, status, created_by)
     SELECT $1, $2, page_type, template_id, template_version, theme_id,
        logo_media_id, banner_media_id, favicon_media_id,
        seo_title, seo_description, seo_keywords, seo_image_media_id,
        custom_css_vars, 'DRAFT', $3
     FROM partner_sites WHERE id = $4
     RETURNING *`,
    [newName, newSlug, createdBy ?? null, id]
  );
  const newSite = rows[0];
  if (!newSite) return null;

  // Copy sections
  await pool.query(
    `INSERT INTO partner_sections (site_id, section_type, content_json, sort_order, is_enabled)
     SELECT $1, section_type, content_json, sort_order, is_enabled
     FROM partner_sections WHERE site_id = $2 ORDER BY sort_order`,
    [newSite.id, id]
  );
  // Copy cards
  await pool.query(
    `INSERT INTO partner_cards
       (site_id, logo_media_id, brand_name, subtitle, description, badge,
        welcome_bonus, free_credit, commission, promo_text,
        telegram_url, whatsapp_url, website_url,
        button_text, button_color, button_style,
        card_bg_color, card_bg_media_id, sort_order, is_enabled)
     SELECT $1, logo_media_id, brand_name, subtitle, description, badge,
        welcome_bonus, free_credit, commission, promo_text,
        telegram_url, whatsapp_url, website_url,
        button_text, button_color, button_style,
        card_bg_color, card_bg_media_id, sort_order, is_enabled
     FROM partner_cards WHERE site_id = $2 ORDER BY sort_order`,
    [newSite.id, id]
  );

  return getSiteById(newSite.id);
}

export async function slugExists(slug: string, excludeId?: number): Promise<boolean> {
  const { rows } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM partner_sites
     WHERE slug = $1 AND deleted_at IS NULL
     ${excludeId ? 'AND id <> $2' : ''}`,
    excludeId ? [slug, excludeId] : [slug]
  );
  return parseInt(rows[0]?.cnt ?? '0') > 0;
}

// ═══════════════════════════════════════════════════════════════
// SECTIONS
// ═══════════════════════════════════════════════════════════════

export async function getSectionsBySite(siteId: number): Promise<PartnerSection[]> {
  const { rows } = await pool.query<PartnerSection>(
    `SELECT * FROM partner_sections WHERE site_id = $1 ORDER BY sort_order ASC, id ASC`,
    [siteId]
  );
  return rows;
}

export async function getSectionById(id: number): Promise<PartnerSection | null> {
  const { rows } = await pool.query<PartnerSection>(
    `SELECT * FROM partner_sections WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function createSection(data: CreateSectionInput): Promise<PartnerSection> {
  const { rows } = await pool.query<PartnerSection>(
    `INSERT INTO partner_sections (site_id, section_type, content_json, sort_order, is_enabled)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      data.site_id,
      data.section_type,
      JSON.stringify(data.content_json ?? {}),
      data.sort_order ?? 0,
      data.is_enabled ?? true,
    ]
  );
  return rows[0];
}

export async function updateSection(id: number, data: UpdateSectionInput): Promise<PartnerSection | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if ('section_type' in data) { fields.push(`section_type = $${i++}`); values.push(data.section_type); }
  if ('content_json' in data) { fields.push(`content_json = $${i++}`); values.push(JSON.stringify(data.content_json)); }
  if ('sort_order'   in data) { fields.push(`sort_order = $${i++}`);   values.push(data.sort_order); }
  if ('is_enabled'   in data) { fields.push(`is_enabled = $${i++}`);   values.push(data.is_enabled); }
  if (fields.length === 0) return getSectionById(id);
  values.push(id);
  const { rows } = await pool.query<PartnerSection>(
    `UPDATE partner_sections SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return rows[0] ?? null;
}

export async function deleteSection(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM partner_sections WHERE id = $1`,
    [id]
  );
  return (rowCount ?? 0) > 0;
}

export async function reorderSections(items: { id: number; sort_order: number }[]): Promise<void> {
  if (items.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { id, sort_order } of items) {
      await client.query(
        `UPDATE partner_sections SET sort_order = $1 WHERE id = $2`,
        [sort_order, id]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════
// CARDS
// ═══════════════════════════════════════════════════════════════

export async function getCardsBySite(siteId: number): Promise<PartnerCard[]> {
  const { rows } = await pool.query<PartnerCard>(
    `SELECT * FROM partner_cards WHERE site_id = $1 ORDER BY sort_order ASC, id ASC`,
    [siteId]
  );
  return rows;
}

export async function getCardById(id: number): Promise<PartnerCard | null> {
  const { rows } = await pool.query<PartnerCard>(
    `SELECT * FROM partner_cards WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function createCard(data: CreateCardInput): Promise<PartnerCard> {
  const { rows } = await pool.query<PartnerCard>(
    `INSERT INTO partner_cards
       (site_id, logo_media_id, brand_name, subtitle, description, badge,
        welcome_bonus, free_credit, commission, promo_text,
        telegram_url, whatsapp_url, website_url,
        button_text, button_color, button_style,
        card_bg_color, card_bg_media_id, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING *`,
    [
      data.site_id,
      data.logo_media_id ?? null,
      data.brand_name,
      data.subtitle ?? null,
      data.description ?? null,
      data.badge ?? null,
      data.welcome_bonus ?? null,
      data.free_credit ?? null,
      data.commission ?? null,
      data.promo_text ?? null,
      data.telegram_url ?? null,
      data.whatsapp_url ?? null,
      data.website_url ?? null,
      data.button_text ?? 'Join Now',
      data.button_color ?? null,
      data.button_style ?? 'solid',
      data.card_bg_color ?? null,
      data.card_bg_media_id ?? null,
      data.sort_order ?? 0,
    ]
  );
  return rows[0];
}

export async function updateCard(id: number, data: UpdateCardInput): Promise<PartnerCard | null> {
  const allowed: (keyof UpdateCardInput)[] = [
    'logo_media_id','brand_name','subtitle','description','badge',
    'welcome_bonus','free_credit','commission','promo_text',
    'telegram_url','whatsapp_url','website_url',
    'button_text','button_color','button_style',
    'card_bg_color','card_bg_media_id','sort_order','is_enabled',
  ];
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const key of allowed) {
    if (key in data) {
      fields.push(`${key} = $${i++}`);
      values.push(data[key] ?? null);
    }
  }
  if (fields.length === 0) return getCardById(id);
  values.push(id);
  const { rows } = await pool.query<PartnerCard>(
    `UPDATE partner_cards SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return rows[0] ?? null;
}

export async function deleteCard(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM partner_cards WHERE id = $1`,
    [id]
  );
  return (rowCount ?? 0) > 0;
}

export async function reorderCards(items: { id: number; sort_order: number }[]): Promise<void> {
  if (items.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { id, sort_order } of items) {
      await client.query(
        `UPDATE partner_cards SET sort_order = $1 WHERE id = $2`,
        [sort_order, id]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC RENDER — single query for the website renderer
// ═══════════════════════════════════════════════════════════════

export interface PartnerSitePublic {
  site: PartnerSite;
  template: PartnerTemplate;
  theme: PartnerTheme;
  sections: PartnerSection[];
  cards: PartnerCard[];
}

export async function getPublicSiteBySlug(slug: string): Promise<PartnerSitePublic | null> {
  const site = await getSiteBySlug(slug);
  if (!site || site.status !== 'PUBLISHED') return null;

  const [template, theme, sections, cards] = await Promise.all([
    getTemplateById(site.template_id),
    getThemeById(site.theme_id),
    getSectionsBySite(site.id),
    getCardsBySite(site.id),
  ]);

  if (!template || !theme) return null;

  return {
    site,
    template,
    theme,
    sections: sections.filter(s => s.is_enabled),
    cards:    cards.filter(c => c.is_enabled),
  };
}
