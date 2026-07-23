import pool from '@/lib/db';
import { unstable_cache } from 'next/cache';

/* ─── Types ──────────────────────────────────────────────── */

export type PartnerSite = {
  id: number;
  name: string;
  slug: string;
  status: string;
  page_type: string;
  logo_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
};

export type LayoutJson = {
  heroStyle?:        string;
  headerStyle?:      string;
  cardStyle?:        string;
  footerStyle?:      string;
  spacing?:          string;
  defaultSections?:  string[];
  [key: string]:     unknown;
};

export type PartnerTemplate = {
  id:          number;
  name:        string;
  slug:        string;
  layout_json: LayoutJson;
};

export type PartnerTheme = {
  id:             number;
  name:           string;
  slug:           string;
  css_variables:  Record<string, string>;
};

export type PartnerSection = {
  id:           number;
  section_type: string;
  sort_order:   number;
  content_json: Record<string, unknown>;
};

export type PartnerCard = {
  id:            number;
  brand_name:    string;
  subtitle:      string | null;
  description:   string | null;
  badge:         string | null;
  welcome_bonus: string | null;
  free_credit:   string | null;
  commission:    string | null;
  promo_text:    string | null;
  logo_url:      string | null;
  telegram_url:  string | null;
  whatsapp_url:  string | null;
  website_url:   string | null;
  button_text:   string;
  button_color:  string | null;
  button_style:  string;
  sort_order:    number;
};

export type PartnerPageData = {
  site:     PartnerSite;
  template: PartnerTemplate;
  theme:    PartnerTheme;
  sections: PartnerSection[];
  cards:    PartnerCard[];
};

/* ─── Raw DB loader ──────────────────────────────────────── */

async function fetchPageData(slug: string): Promise<PartnerPageData | null> {
  /* 1. Load site — only PUBLISHED (uppercase), non-deleted.
   *    logo_url is constructed from logo_media_id; partner_sites has no logo_url column.
   */
  const siteRes = await pool.query<
    Omit<PartnerSite, 'logo_url'> & {
      logo_url: string | null;
      template_id: number | null;
      theme_id: number | null;
    }
  >(
    `SELECT
       id, name, slug, status, page_type,
       meta_title, meta_description,
       template_id, theme_id,
       CASE WHEN logo_media_id IS NOT NULL
            THEN '/api/public/media/' || logo_media_id::text
            ELSE NULL
       END AS logo_url
     FROM partner_sites
     WHERE slug = $1 AND deleted_at IS NULL`,
    [slug]
  );

  const row = siteRes.rows[0];
  /* status is stored as 'PUBLISHED' (uppercase) */
  if (!row || row.status !== 'PUBLISHED') return null;

  const site: PartnerSite = {
    id:               row.id,
    name:             row.name,
    slug:             row.slug,
    status:           row.status,
    page_type:        row.page_type,
    logo_url:         row.logo_url,
    meta_title:       row.meta_title,
    meta_description: row.meta_description,
  };

  if (!row.template_id || !row.theme_id) return null;

  /* 2. Parallel load template + theme + sections + cards */
  const [tplRes, themeRes, secRes, cardRes] = await Promise.all([
    pool.query<PartnerTemplate>(
      `SELECT id, name, slug, layout_json FROM partner_templates WHERE id = $1`,
      [row.template_id]
    ),
    pool.query<PartnerTheme>(
      `SELECT id, name, slug, css_variables FROM partner_themes WHERE id = $1`,
      [row.theme_id]
    ),
    pool.query<PartnerSection>(
      `SELECT id, section_type, sort_order, content_json
       FROM partner_sections
       WHERE site_id = $1 AND is_enabled = true
       ORDER BY sort_order ASC`,
      [row.id]
    ),
    pool.query<PartnerCard>(
      `SELECT
         pc.id, pc.brand_name, pc.subtitle, pc.description, pc.badge,
         pc.welcome_bonus, pc.free_credit, pc.commission, pc.promo_text,
         CASE WHEN pc.logo_media_id IS NOT NULL
              THEN '/api/public/media/' || pc.logo_media_id::text
              ELSE NULL
         END AS logo_url,
         pc.telegram_url, pc.whatsapp_url, pc.website_url,
         pc.button_text, pc.button_color, pc.button_style, pc.sort_order
       FROM partner_cards pc
       WHERE pc.site_id = $1 AND pc.is_enabled = true
       ORDER BY pc.sort_order ASC`,
      [row.id]
    ),
  ]);

  const template = tplRes.rows[0];
  const theme    = themeRes.rows[0];
  if (!template || !theme) return null;

  return {
    site,
    template: { ...template, layout_json: (template.layout_json ?? {}) as LayoutJson },
    theme,
    sections: secRes.rows,
    cards:    cardRes.rows,
  };
}

/* ─── ISR-cached loader (60-second revalidation per slug) ── */

export function getPartnerPage(slug: string): Promise<PartnerPageData | null> {
  return unstable_cache(
    () => fetchPageData(slug),
    [`partner-site-${slug}`],
    {
      revalidate: 60,
      tags: [`partner-site-${slug}`, 'partner-sites'],
    }
  )();
}
