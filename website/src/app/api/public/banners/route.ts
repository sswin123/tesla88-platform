import { NextResponse } from 'next/server';
import pool from '@/lib/db';

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
    return NextResponse.json(res.rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
