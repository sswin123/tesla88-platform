import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export interface PublicCategoryIcon {
  category_key: string;
  icon_type:     'none' | 'emoji' | 'image' | 'gif' | 'svg';
  icon_emoji:    string | null;
  icon_media_url: string | null;
  icon_svg:      string | null;
}

// GET /api/public/lobby-icons
// Returns all configured category icons keyed by category_key.
export async function GET() {
  try {
    const res = await pool.query<{
      category_key: string;
      icon_type: string;
      icon_emoji: string | null;
      icon_media_id: number | null;
      icon_svg: string | null;
    }>(`SELECT category_key, icon_type, icon_emoji, icon_media_id, icon_svg
        FROM website_lobby_category_icons
        ORDER BY category_key`);

    const icons: PublicCategoryIcon[] = res.rows.map(r => {
      const t = r.icon_type as PublicCategoryIcon['icon_type'];
      return {
        category_key:   r.category_key,
        icon_type:      t,
        icon_emoji:     t === 'emoji' ? r.icon_emoji : null,
        icon_media_url: (t === 'image' || t === 'gif') && r.icon_media_id
          ? `/api/public/media/${r.icon_media_id}`
          : null,
        icon_svg:       t === 'svg' ? r.icon_svg : null,
      };
    });

    return NextResponse.json(icons, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('GET /api/public/lobby-icons', err);
    return NextResponse.json([], { status: 200 });
  }
}
