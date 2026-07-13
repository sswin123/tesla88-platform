import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export interface PublicLobbyCategory {
  id:                 number;
  category_code:      string;
  category_name:      string;
  icon_type:          'none' | 'emoji' | 'image' | 'gif' | 'svg';
  icon_emoji:         string | null;
  icon_media_url:     string | null;
  icon_svg:           string | null;
  is_default:         boolean;
  display_order:      number;
  image_display_size: 'small' | 'medium' | 'large';
  image_display_mode: 'contain' | 'cover' | 'stretch';
}

// GET /api/public/lobby-categories
// Returns all active categories ordered by display_order.
export async function GET() {
  try {
    const res = await pool.query<{
      id: number;
      category_code: string;
      category_name: string;
      icon_type: string;
      icon_emoji: string | null;
      icon_media_id: number | null;
      icon_svg: string | null;
      is_default: boolean;
      display_order: number;
      image_display_size: string;
      image_display_mode: string;
    }>(
      `SELECT id, category_code, category_name,
              icon_type, icon_emoji, icon_media_id, icon_svg,
              is_default, display_order,
              image_display_size, image_display_mode
       FROM website_game_categories
       WHERE is_active = TRUE
       ORDER BY display_order ASC, id ASC`
    );

    const categories: PublicLobbyCategory[] = res.rows.map(r => {
      const t = r.icon_type as PublicLobbyCategory['icon_type'];
      return {
        id:                 r.id,
        category_code:      r.category_code,
        category_name:      r.category_name,
        icon_type:          t,
        icon_emoji:         t === 'emoji' ? r.icon_emoji : null,
        icon_media_url:     (t === 'image' || t === 'gif') && r.icon_media_id
          ? `/api/public/media/${r.icon_media_id}`
          : null,
        icon_svg:           t === 'svg' ? r.icon_svg : null,
        is_default:         r.is_default,
        display_order:      r.display_order,
        image_display_size: (r.image_display_size as PublicLobbyCategory['image_display_size']) ?? 'medium',
        image_display_mode: (r.image_display_mode as PublicLobbyCategory['image_display_mode']) ?? 'contain',
      };
    });

    return NextResponse.json(categories, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('GET /api/public/lobby-categories', err);
    // Return default categories as fallback so website doesn't break
    return NextResponse.json([
      { id: 0, category_code: 'all',  category_name: 'All',  icon_type: 'none', icon_emoji: null, icon_media_url: null, icon_svg: null, is_default: true,  display_order: 0,  image_display_size: 'medium', image_display_mode: 'contain' },
      { id: 0, category_code: 'hot',  category_name: 'Hot',  icon_type: 'none', icon_emoji: null, icon_media_url: null, icon_svg: null, is_default: false, display_order: 10, image_display_size: 'medium', image_display_mode: 'contain' },
      { id: 0, category_code: 'slot', category_name: 'Slot', icon_type: 'none', icon_emoji: null, icon_media_url: null, icon_svg: null, is_default: false, display_order: 20, image_display_size: 'medium', image_display_mode: 'contain' },
      { id: 0, category_code: 'live', category_name: 'Live', icon_type: 'none', icon_emoji: null, icon_media_url: null, icon_svg: null, is_default: false, display_order: 30, image_display_size: 'medium', image_display_mode: 'contain' },
    ] as PublicLobbyCategory[], { status: 200 });
  }
}
