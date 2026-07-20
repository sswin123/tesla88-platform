import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// @deprecated Phase M4a — Zero active Website consumers confirmed via Phase 4.5 Consumer Audit.
// Route preserved for backward compatibility. Database and ERP infrastructure unchanged.
// Planned retirement: Phase M4c (requires M4b approval + 14-day production observation).

export interface PublicBanner {
  id: number;
  title: string;
  description: string | null;
  image_media_id: number | null;
  mobile_image_media_id: number | null;
  link_url: string | null;
  button_text: string | null;
  display_order: number;
}

// RFC 8594 deprecation signal — backward compatible, route continues to respond with full data.
const DEPRECATION_HEADERS = {
  Deprecation: 'true',
  'X-Deprecation-Info': 'Endpoint deprecated (Phase M4a). Zero Website consumers. Pending M4c retirement.',
  'Cache-Control': 'no-store',
} as const;

export async function GET() {
  try {
    const res = await pool.query<PublicBanner>(
      `SELECT id, title, description, image_media_id, mobile_image_media_id,
              link_url, button_text, display_order
       FROM website_banners
       WHERE is_active = TRUE
         AND (start_at IS NULL OR start_at <= NOW())
         AND (end_at   IS NULL OR end_at   >  NOW())
       ORDER BY display_order ASC, id ASC`
    );
    return NextResponse.json(res.rows, { headers: DEPRECATION_HEADERS });
  } catch {
    return NextResponse.json([], { status: 200, headers: DEPRECATION_HEADERS });
  }
}
