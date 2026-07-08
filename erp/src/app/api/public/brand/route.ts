import { NextResponse } from 'next/server';
import pool from '@/lib/db';

const PUBLIC_COLS = `
  brand_name, company_name, tagline,
  logo_media_id, favicon_media_id,
  primary_color, secondary_color, theme_mode,
  website_domain, api_domain,
  support_whatsapp, support_telegram, telegram_channel, facebook_url,
  seo_title, seo_description, seo_keywords
`.trim();

export async function GET() {
  try {
    const r = await pool.query(`SELECT ${PUBLIC_COLS} FROM brand_settings WHERE id = 1`);
    if (r.rows.length === 0) {
      return NextResponse.json({ error: 'Brand settings not found' }, { status: 404 });
    }
    return NextResponse.json(r.rows[0]);
  } catch (err) {
    console.error('[public/brand GET]', err);
    return NextResponse.json({ error: 'Failed to load brand' }, { status: 500 });
  }
}
