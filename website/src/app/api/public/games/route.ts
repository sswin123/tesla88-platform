import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export interface PublicGame {
  id: number;
  provider_code: string;
  provider_display_name: string;
  game_code: string;
  display_name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  launch_mode: string;
  icon_url: string | null;
  thumbnail_url: string | null;
  banner_url: string | null;
  is_hot: boolean;
  is_new: boolean;
  featured: boolean;
  recommended: boolean;
  is_maintenance: boolean;
  desktop_supported: boolean;
  mobile_supported: boolean;
  sort_order: number;
}

/**
 * GET /api/public/games
 *
 * Public game list for the Website Game Center.
 * Only returns visible, active games from providers that are ACTIVE or TESTING.
 *
 * Query params:
 *   category     (slot | live | sport | fishing | ...)
 *   provider     (provider_code)
 *   hot          (true)
 *   featured     (true)
 *   recommended  (true)
 *   new          (true)
 *   limit        (default 50, max 200)
 *   offset       (default 0)
 */
export async function GET(req: NextRequest) {
  const sp       = req.nextUrl.searchParams;
  const category = sp.get('category') ?? null;
  const provider = sp.get('provider')?.toUpperCase() ?? null;
  const hot      = sp.get('hot') === 'true';
  const featured = sp.get('featured') === 'true';
  const recommended = sp.get('recommended') === 'true';
  const isNew    = sp.get('new') === 'true';
  const limit    = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50', 10)));
  const offset   = Math.max(0, parseInt(sp.get('offset') ?? '0', 10));

  try {
    const conditions: string[] = [
      `g.visible = TRUE`,
      `g.is_active = TRUE`,
      `p.status IN ('ACTIVE', 'TESTING')`,
      `p.website_visible = TRUE`,
      `COALESCE(p.website_display_mode, 'PROVIDER_CARD') != 'PROVIDER_CARD'`,
    ];
    const vals: unknown[] = [];
    let i = 1;

    if (category) { conditions.push(`g.category = $${i++}`); vals.push(category); }
    if (provider) { conditions.push(`p.code = $${i++}`); vals.push(provider); }
    if (hot)       conditions.push('g.is_hot = TRUE');
    if (featured)  conditions.push('g.featured = TRUE');
    if (recommended) conditions.push('g.recommended = TRUE');
    if (isNew)     conditions.push('g.is_new = TRUE');

    const where = `WHERE ${conditions.join(' AND ')}`;

    const { rows } = await pool.query<PublicGame & { total_count: string }>(
      `SELECT
         g.id, p.code AS provider_code,
         COALESCE(p.website_display_name, p.display_name) AS provider_display_name,
         g.game_code,
         COALESCE(g.display_name, g.name) AS display_name,
         g.description, g.category, g.subcategory,
         g.launch_mode,
         g.icon_url, g.thumbnail_url, g.banner_url,
         g.is_hot, g.is_new, g.featured, g.recommended, g.is_maintenance,
         g.desktop_supported, g.mobile_supported, g.sort_order
       FROM gp_games g
       JOIN gp_providers p ON p.id = g.provider_id
       ${where}
       ORDER BY g.sort_order ASC, g.id ASC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...vals, limit, offset],
    );

    return NextResponse.json(rows, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
