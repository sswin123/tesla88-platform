import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// With Migration 024+025 columns
const PUBLIC_COLS = `
  brand_name, company_name, tagline,
  logo_media_id, favicon_media_id,
  COALESCE(logo_size,  'medium') AS logo_size,
  COALESCE(logo_align, 'left')   AS logo_align,
  primary_color, secondary_color, theme_mode,
  COALESCE(color_bg,   '#0a0b14') AS color_bg,
  COALESCE(color_card, '#111222') AS color_card,
  COALESCE(color_text, '#e8e8f5') AS color_text,
  website_domain, api_domain,
  support_whatsapp, support_telegram, telegram_channel, facebook_url,
  seo_title, seo_description, seo_keywords
`.trim();

// Fallback without Migration 024/025 columns
const PUBLIC_COLS_COMPAT = `
  brand_name, company_name, tagline,
  logo_media_id, favicon_media_id,
  primary_color, secondary_color, theme_mode,
  website_domain, api_domain,
  support_whatsapp, support_telegram, telegram_channel, facebook_url,
  seo_title, seo_description, seo_keywords
`.trim();

export async function GET() {
  // Try with Migration 024 color columns
  try {
    const r = await pool.query(`SELECT ${PUBLIC_COLS} FROM brand_settings WHERE id = 1`);
    if (r.rows.length === 0) {
      return NextResponse.json({ error: 'Brand settings not found' }, { status: 404 });
    }
    return NextResponse.json(r.rows[0]);
  } catch {
    // Migration 024 not applied yet — fallback without color theme columns
    try {
      const r = await pool.query(`SELECT ${PUBLIC_COLS_COMPAT} FROM brand_settings WHERE id = 1`);
      if (r.rows.length === 0) {
        return NextResponse.json({ error: 'Brand settings not found' }, { status: 404 });
      }
      const row = {
        ...r.rows[0],
        logo_size:  'medium',
        logo_align: 'left',
        color_bg:   '#0a0b14',
        color_card: '#111222',
        color_text: '#e8e8f5',
      };
      return NextResponse.json(row);
    } catch (e2) {
      console.error('[public/brand GET]', e2);
      return NextResponse.json({ error: 'Failed to load brand' }, { status: 500 });
    }
  }
}
