import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';
import type { WebsiteGameCategory } from '@/lib/types';

const VALID_ICON_TYPES = ['none', 'emoji', 'image', 'gif', 'svg'] as const;

// GET /api/website/lobby-categories — list all categories (ordered)
export async function GET() {
  try {
    const payload = await requirePermission('website.builder.manage');
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const res = await pool.query<WebsiteGameCategory>(
      `SELECT id, category_code, category_name,
              icon_type, icon_emoji, icon_media_id, icon_svg,
              display_order, is_default, is_active,
              image_display_size, image_display_mode,
              image_custom_width, image_custom_height,
              hover_animation, border_style, background_style, shadow_style,
              created_at, updated_at
       FROM website_game_categories
       ORDER BY display_order ASC, id ASC`
    );
    return NextResponse.json(res.rows);
  } catch (error) {
    console.error('[GET /api/website/lobby-categories]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST /api/website/lobby-categories — create new category
export async function POST(req: NextRequest) {
  try {
    const payload = await requirePermission('website.builder.manage');
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: {
      category_code?: string;
      category_name?: string;
      icon_type?: string;
      icon_emoji?: string | null;
      icon_media_id?: number | null;
      icon_svg?: string | null;
      display_order?: number;
      is_default?: boolean;
      is_active?: boolean;
      image_display_size?: string;
      image_display_mode?: string;
      image_custom_width?: number | null;
      image_custom_height?: number | null;
    };
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const code = body.category_code?.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!code) return NextResponse.json({ error: 'category_code required' }, { status: 400 });
    if (!body.category_name?.trim()) return NextResponse.json({ error: 'category_name required' }, { status: 400 });

    const icon_type = VALID_ICON_TYPES.includes(body.icon_type as typeof VALID_ICON_TYPES[number])
      ? body.icon_type : 'none';

    // If new category is marked as default, clear all others first
    if (body.is_default) {
      await pool.query('UPDATE website_game_categories SET is_default = FALSE');
    }

    const validSizes = ['auto', 'small', 'medium', 'large', 'custom'];
    const validModes = ['contain', 'cover', 'stretch'];
    const image_display_size = validSizes.includes(body.image_display_size ?? '')
      ? body.image_display_size! : 'auto';
    const image_display_mode = validModes.includes(body.image_display_mode ?? '')
      ? body.image_display_mode! : 'contain';
    const clampDim = (v: unknown) =>
      typeof v === 'number' ? Math.max(24, Math.min(200, Math.round(v))) : null;
    const image_custom_width  = clampDim(body.image_custom_width);
    const image_custom_height = clampDim(body.image_custom_height);

    const res = await pool.query<WebsiteGameCategory>(
      `INSERT INTO website_game_categories
         (category_code, category_name, icon_type, icon_emoji, icon_media_id, icon_svg,
          display_order, is_default, is_active,
          image_display_size, image_display_mode,
          image_custom_width, image_custom_height)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        code,
        body.category_name.trim(),
        icon_type,
        body.icon_emoji ?? null,
        body.icon_media_id ?? null,
        body.icon_svg ?? null,
        body.display_order ?? 0,
        body.is_default ?? false,
        body.is_active ?? true,
        image_display_size,
        image_display_mode,
        image_custom_width,
        image_custom_height,
      ]
    );
    return NextResponse.json(res.rows[0], { status: 201 });
  } catch (error) {
    const msg = String(error);
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'category_code already exists' }, { status: 409 });
    }
    console.error('[POST /api/website/lobby-categories]', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
