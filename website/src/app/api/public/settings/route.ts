import { NextResponse } from 'next/server';
import pool from '@/lib/db';

const WEBSITE_KEYS = [
  'site_brand_name','site_primary_color','site_logo_media_id','site_banner_text',
  'site_banner_media_id','site_contact_email','site_contact_phone','site_seo_title',
  'site_seo_description','site_terms_url','website_enabled','deposit_min_amount',
];

export async function GET() {
  const res = await pool.query<{ key: string; value: string }>(
    'SELECT key, value FROM system_settings WHERE key = ANY($1)', [WEBSITE_KEYS]
  );
  const settings = Object.fromEntries(res.rows.map(r => [r.key, r.value]));
  return NextResponse.json(settings);
}
