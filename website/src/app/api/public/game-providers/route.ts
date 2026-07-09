import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export interface PublicGameProvider {
  id: number;
  provider_code: string;
  provider_name: string;
  category: 'slot' | 'live' | 'sport' | 'fishing';
  logo_media_id: number | null;
  banner_media_id: number | null;
  is_hot: boolean;
  is_new: boolean;
  display_order: number;
}

export async function GET() {
  try {
    const res = await pool.query<PublicGameProvider>(
      `SELECT id, provider_code, provider_name, category,
              logo_media_id, banner_media_id, is_hot, is_new, display_order
       FROM website_game_providers
       WHERE is_active = TRUE
       ORDER BY display_order ASC, id ASC`
    );
    return NextResponse.json(res.rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
