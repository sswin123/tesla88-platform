import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

/**
 * GET /api/games/library
 *
 * Paginated, filterable game list from gp_games.
 * Query params:
 *   page          (default 1)
 *   limit         (default 50, max 200)
 *   provider_code (filter by provider)
 *   category      (filter by category)
 *   import_mode   API | MANUAL
 *   launch_mode   LOBBY | DIRECT | EXTERNAL | DOWNLOAD | COMING_SOON
 *   status        active | inactive | maintenance
 *   search        (name / display_name ILIKE)
 *   hot           true | false
 *   featured      true | false
 *   recommended   true | false
 */
export async function GET(req: NextRequest) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const page         = Math.max(1, parseInt(sp.get('page') ?? '1', 10));
  const limit        = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50', 10)));
  const offset       = (page - 1) * limit;

  const providerCode = sp.get('provider_code')?.toUpperCase() ?? null;
  const category     = sp.get('category') ?? null;
  const importMode   = sp.get('import_mode') ?? null;
  const launchMode   = sp.get('launch_mode') ?? null;
  const status       = sp.get('status') ?? null;   // active | inactive | maintenance
  const search       = sp.get('search') ?? null;
  const hot          = sp.get('hot') ?? null;
  const featured     = sp.get('featured') ?? null;
  const recommended  = sp.get('recommended') ?? null;
  const sortBy       = sp.get('sort') ?? 'sort_order';  // sort_order | name | created_at

  const conditions: string[] = [];
  const vals: unknown[]      = [];
  let i = 1;

  if (providerCode) { conditions.push(`p.code = $${i++}`); vals.push(providerCode); }
  if (category)     { conditions.push(`g.category = $${i++}`); vals.push(category); }
  if (importMode)   { conditions.push(`g.import_mode = $${i++}`); vals.push(importMode); }
  if (launchMode)   { conditions.push(`g.launch_mode = $${i++}`); vals.push(launchMode); }
  if (hot === 'true')          { conditions.push('g.is_hot = TRUE'); }
  if (featured === 'true')     { conditions.push('g.featured = TRUE'); }
  if (recommended === 'true')  { conditions.push('g.recommended = TRUE'); }
  if (status === 'active')     { conditions.push('g.is_active = TRUE AND g.is_maintenance = FALSE'); }
  if (status === 'inactive')   { conditions.push('g.is_active = FALSE'); }
  if (status === 'maintenance'){ conditions.push('g.is_maintenance = TRUE'); }
  if (search) {
    conditions.push(`(g.name ILIKE $${i} OR g.display_name ILIKE $${i})`);
    vals.push(`%${search}%`); i++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const ALLOWED_SORT: Record<string, string> = {
    sort_order: 'g.sort_order ASC, g.id ASC',
    name:       'COALESCE(g.display_name, g.name) ASC',
    created_at: 'g.created_at DESC',
    updated_at: 'g.updated_at DESC',
  };
  const orderBy = ALLOWED_SORT[sortBy] ?? ALLOWED_SORT.sort_order;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM gp_games g
    JOIN gp_providers p ON p.id = g.provider_id
    ${where}
  `;

  const dataSql = `
    SELECT
      g.id, g.provider_id, p.code AS provider_code, p.display_name AS provider_display_name,
      g.game_code,
      COALESCE(g.display_name, g.name) AS display_name,
      g.name AS original_name,
      g.description, g.category, g.subcategory,
      g.game_type, g.sub_type,
      g.icon_url, g.thumbnail_url, g.banner_url,
      g.import_mode, g.launch_mode,
      g.visible, g.featured, g.recommended,
      g.is_active, g.is_hot, g.is_new, g.is_maintenance,
      g.desktop_supported, g.mobile_supported,
      g.sort_order, g.synced_at, g.created_at, g.updated_at
    FROM gp_games g
    JOIN gp_providers p ON p.id = g.provider_id
    ${where}
    ORDER BY ${orderBy}
    LIMIT $${i} OFFSET $${i + 1}
  `;

  const [countRes, dataRes] = await Promise.all([
    pool.query<{ total: string }>(countSql, vals),
    pool.query(dataSql, [...vals, limit, offset]),
  ]);

  const total = parseInt(countRes.rows[0]?.total ?? '0', 10);

  return NextResponse.json({
    games: dataRes.rows,
    total,
    page,
    pages: Math.ceil(total / limit),
    limit,
  });
}

/**
 * POST /api/games/library
 *
 * Create a game manually (import_mode = MANUAL).
 * Used for providers without a Game List API (e.g. 918KISS).
 */
export async function POST(req: NextRequest) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    provider_code:  string;
    game_code:      string;
    name:           string;
    display_name?:  string | null;
    description?:   string | null;
    category?:      string;
    subcategory?:   string | null;
    launch_mode?:   string;
    thumbnail_url?: string | null;
    icon_url?:      string | null;
    banner_url?:    string | null;
    visible?:       boolean;
    featured?:      boolean;
    recommended?:   boolean;
    is_hot?:        boolean;
    is_new?:        boolean;
    desktop_supported?: boolean;
    mobile_supported?:  boolean;
    sort_order?:    number;
    metadata?:      Record<string, unknown>;
  };

  if (!body.provider_code || !body.game_code || !body.name) {
    return NextResponse.json({ error: 'provider_code, game_code and name are required' }, { status: 400 });
  }

  const VALID_LAUNCH_MODES = ['LOBBY','DIRECT','EXTERNAL','DOWNLOAD','COMING_SOON'];
  if (body.launch_mode && !VALID_LAUNCH_MODES.includes(body.launch_mode)) {
    return NextResponse.json({ error: `Invalid launch_mode. Allowed: ${VALID_LAUNCH_MODES.join(', ')}` }, { status: 400 });
  }

  // Resolve provider
  const { rows: provRows } = await pool.query<{ id: number }>(
    `SELECT id FROM gp_providers WHERE code = $1 LIMIT 1`,
    [body.provider_code.toUpperCase()],
  );
  if (!provRows[0]) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  const providerId = provRows[0].id;

  const { rows } = await pool.query(
    `INSERT INTO gp_games
       (provider_id, game_code, name, display_name, description,
        category, subcategory, launch_mode, import_mode,
        icon_url, thumbnail_url, banner_url,
        visible, featured, recommended,
        is_hot, is_new, is_active,
        desktop_supported, mobile_supported,
        sort_order, metadata, synced_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'MANUAL',$9,$10,$11,$12,$13,$14,$15,$16,TRUE,$17,$18,$19,$20,NOW(),NOW(),NOW())
     ON CONFLICT (provider_id, game_code) DO NOTHING
     RETURNING id`,
    [
      providerId,
      body.game_code,
      body.name,
      body.display_name ?? null,
      body.description ?? null,
      body.category ?? 'slot',
      body.subcategory ?? null,
      body.launch_mode ?? 'DIRECT',
      body.icon_url ?? null,
      body.thumbnail_url ?? null,
      body.banner_url ?? null,
      body.visible ?? true,
      body.featured ?? false,
      body.recommended ?? false,
      body.is_hot ?? false,
      body.is_new ?? false,
      body.desktop_supported ?? true,
      body.mobile_supported ?? true,
      body.sort_order ?? 0,
      JSON.stringify(body.metadata ?? {}),
    ],
  );

  if (!rows[0]) {
    return NextResponse.json({ error: `Game code "${body.game_code}" already exists for this provider` }, { status: 409 });
  }

  return NextResponse.json({ ok: true, id: rows[0].id });
}
