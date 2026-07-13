import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

const SELECT_GAMES = `
  SELECT g.id, g.provider_id, p.provider_name,
         g.game_code, g.game_name, g.category, g.category_id,
         g.thumbnail_media_id, g.banner_media_id,
         g.is_hot, g.is_new, g.is_active,
         g.source, g.api_provider, g.display_order,
         g.created_at, g.updated_at
  FROM website_games g
  LEFT JOIN website_game_providers p ON p.id = g.provider_id
  ORDER BY g.display_order ASC, g.id ASC
`;

export async function GET() {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const res = await pool.query(SELECT_GAMES);
    return NextResponse.json(res.rows);
  } catch (error) {
    console.error('GET /api/website/games', error);
    return NextResponse.json({ error: String(error), stack: (error as Error)?.stack }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await requirePermission('website.builder.manage');
    if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const game_name = (body.game_name as string | undefined)?.trim();
    if (!game_name) return NextResponse.json({ error: 'game_name required' }, { status: 400 });

    const code = (body.game_code as string | undefined)?.trim() || `manual-${Date.now()}`;

    const res = await pool.query(
      `INSERT INTO website_games
         (provider_id, game_code, game_name, category, category_id,
          thumbnail_media_id, banner_media_id,
          is_hot, is_new, is_active, source, api_provider, api_data, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        (body.provider_id as number | null) || null,
        code,
        game_name,
        (body.category as string) ?? 'slot',
        (body.category_id as number | null) ?? null,
        (body.thumbnail_media_id as number | null) ?? null,
        (body.banner_media_id as number | null) ?? null,
        (body.is_hot as boolean) ?? false,
        (body.is_new as boolean) ?? false,
        (body.is_active as boolean) ?? true,
        (body.source as string) ?? 'manual',
        (body.api_provider as string | null) ?? null,
        body.api_data ?? null,
        (body.display_order as number) ?? 0,
      ]
    );
    return NextResponse.json(res.rows[0], { status: 201 });
  } catch (error: unknown) {
    const e = error as { code?: string; stack?: string };
    if (e.code === '23505') return NextResponse.json({ error: 'Duplicate game_code for this provider' }, { status: 409 });
    console.error('POST /api/website/games', error);
    return NextResponse.json({ error: String(error), stack: e.stack }, { status: 500 });
  }
}
