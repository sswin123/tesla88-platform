import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';
import type { WebsiteLobbyCategory } from '@/lib/types';

const VALID_ICON_TYPES = ['none', 'emoji', 'image', 'gif', 'svg'] as const;

// GET /api/website/lobby-icons — list all category icon configs
export async function GET() {
  try {
    const payload = await requirePermission('website.builder.manage');
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const res = await pool.query<WebsiteLobbyCategory>(
      `SELECT id, category_key, icon_type, icon_emoji, icon_media_id, icon_svg, created_at, updated_at
       FROM website_lobby_category_icons
       ORDER BY category_key`
    );
    return NextResponse.json(res.rows);
  } catch (error) {
    console.error('[GET /api/website/lobby-icons]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PUT /api/website/lobby-icons — upsert icon for a category key
export async function PUT(req: NextRequest) {
  try {
    const payload = await requirePermission('website.builder.manage');
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: {
      category_key?: string;
      icon_type?: string;
      icon_emoji?: string | null;
      icon_media_id?: number | null;
      icon_svg?: string | null;
    };
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    if (!body.category_key?.trim())
      return NextResponse.json({ error: 'category_key required' }, { status: 400 });

    const icon_type = VALID_ICON_TYPES.includes(body.icon_type as typeof VALID_ICON_TYPES[number])
      ? body.icon_type
      : 'none';

    const res = await pool.query<WebsiteLobbyCategory>(
      `INSERT INTO website_lobby_category_icons
         (category_key, icon_type, icon_emoji, icon_media_id, icon_svg)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (category_key) DO UPDATE SET
         icon_type     = EXCLUDED.icon_type,
         icon_emoji    = EXCLUDED.icon_emoji,
         icon_media_id = EXCLUDED.icon_media_id,
         icon_svg      = EXCLUDED.icon_svg,
         updated_at    = NOW()
       RETURNING id, category_key, icon_type, icon_emoji, icon_media_id, icon_svg, created_at, updated_at`,
      [
        body.category_key.trim(),
        icon_type,
        body.icon_emoji ?? null,
        body.icon_media_id ?? null,
        body.icon_svg ?? null,
      ]
    );
    return NextResponse.json(res.rows[0]);
  } catch (error) {
    console.error('[PUT /api/website/lobby-icons]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/website/lobby-icons?key=slot — reset a category icon to none
export async function DELETE(req: NextRequest) {
  try {
    const payload = await requirePermission('website.builder.manage');
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const key = req.nextUrl.searchParams.get('key');
    if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

    await pool.query('DELETE FROM website_lobby_category_icons WHERE category_key = $1', [key]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[DELETE /api/website/lobby-icons]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
