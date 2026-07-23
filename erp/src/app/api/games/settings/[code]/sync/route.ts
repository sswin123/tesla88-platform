import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';
import { getKiss918Adapter } from '@/lib/gaming';
import type { GameListItem } from '@/lib/providers/types/game.types';
import { GAME_TYPE } from '@/lib/providers/types/game.types';

type Params = { params: Promise<{ code: string }> };

/**
 * POST /api/games/settings/[code]/sync
 *
 * Fetches the game catalog from the provider's API and upserts into:
 *   1. gp_games     — internal provider catalog (full metadata)
 *   2. website_games — website display catalog (visible in Games Library)
 *
 * Requires: game.manage permission
 * Provider support: 918KISS (more providers added as adapters are built)
 */
export async function POST(_req: Request, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;
  const upperCode = code.toUpperCase();

  // ── 1. Find gp_providers record ───────────────────────────────────────────
  const { rows: provRows } = await pool.query<{
    id: number; code: string; display_name: string; status: string;
  }>(
    `SELECT id, code, display_name, status FROM gp_providers WHERE code = $1 LIMIT 1`,
    [upperCode],
  );
  if (!provRows[0]) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  const provider = provRows[0];

  if (provider.status === 'DISABLED' || provider.status === 'DEPRECATED') {
    return NextResponse.json(
      { error: `Cannot sync games for ${upperCode} — provider status is ${provider.status}` },
      { status: 422 },
    );
  }

  // ── 2. Get adapter and fetch game list ────────────────────────────────────
  let games: GameListItem[];

  if (upperCode === '918KISS') {
    const adapter = await getKiss918Adapter();
    if (!adapter) {
      return NextResponse.json(
        { error: 'Adapter not initialized. Check provider status and credentials.' },
        { status: 503 },
      );
    }
    try {
      const result = await adapter.getGameList();
      games = result.games;
    } catch (err) {
      return NextResponse.json(
        { error: `getGameList failed: ${err instanceof Error ? err.message : String(err)}` },
        { status: 502 },
      );
    }
  } else {
    return NextResponse.json(
      { error: `Game sync not yet implemented for ${upperCode}` },
      { status: 422 },
    );
  }

  if (games.length === 0) {
    return NextResponse.json({ ok: true, gp_games: { inserted: 0, updated: 0, deactivated: 0 }, website_games: { inserted: 0, updated: 0 }, total: 0, synced_at: new Date().toISOString() });
  }

  // ── 3. Upsert into gp_games ───────────────────────────────────────────────
  let gpInserted = 0;
  let gpUpdated  = 0;

  for (const game of games) {
    const { rows } = await pool.query<{ xmax: string }>(
      `INSERT INTO gp_games
         (provider_id, game_code, name, game_type, sub_type, icon_url, banner_url,
          is_active, metadata, synced_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
       ON CONFLICT (provider_id, game_code) DO UPDATE
         SET name       = EXCLUDED.name,
             game_type  = EXCLUDED.game_type,
             sub_type   = EXCLUDED.sub_type,
             icon_url   = EXCLUDED.icon_url,
             banner_url = EXCLUDED.banner_url,
             is_active  = EXCLUDED.is_active,
             metadata   = EXCLUDED.metadata,
             synced_at  = NOW(),
             updated_at = NOW()
       RETURNING (xmax = 0) AS is_insert`,
      [
        provider.id, game.game_code, game.name, game.game_type,
        game.sub_type ?? null, game.icon_url ?? null, game.banner_url ?? null,
        game.is_active ?? true, JSON.stringify(game.metadata ?? {}),
      ],
    );
    if (rows[0]?.xmax === '0') gpInserted++;
    else gpUpdated++;
  }

  // Deactivate games no longer in the API response
  const activeCodes = games.map(g => g.game_code);
  const { rowCount: gpDeactivated } = await pool.query(
    `UPDATE gp_games SET is_active = FALSE, updated_at = NOW()
     WHERE provider_id = $1 AND is_active = TRUE AND game_code != ALL($2::text[])`,
    [provider.id, activeCodes],
  );

  // ── 4. Find matching website_game_providers entry (optional link) ──────────
  const { rows: wgpRows } = await pool.query<{ id: number }>(
    `SELECT id FROM website_game_providers WHERE provider_code = $1 LIMIT 1`,
    [upperCode],
  );
  const websiteProviderId: number | null = wgpRows[0]?.id ?? null;

  // ── 5. Mirror into website_games ──────────────────────────────────────────
  // Unique constraint: (game_code, COALESCE(provider_id, 0))
  // We use a SELECT + INSERT/UPDATE pattern to handle the functional index.
  let wsInserted = 0;
  let wsUpdated  = 0;

  const coalesceProviderId = websiteProviderId ?? 0;

  for (const game of games) {
    const category = mapToWebsiteCategory(game.game_type);
    const apiData  = JSON.stringify({
      game_type: game.game_type,
      icon_url:  game.icon_url,
      ...(game.metadata ?? {}),
    });

    const { rows: existing } = await pool.query<{ id: number }>(
      `SELECT id FROM website_games
       WHERE game_code = $1 AND COALESCE(provider_id, 0) = $2
       LIMIT 1`,
      [game.game_code, coalesceProviderId],
    );

    if (existing[0]) {
      // UPDATE: refresh name, category, api_data — do NOT overwrite is_active/display_order
      // so admins retain control over what's visible.
      await pool.query(
        `UPDATE website_games
         SET game_name   = $1,
             api_data    = $2,
             updated_at  = NOW()
         WHERE id = $3`,
        [game.name, apiData, existing[0].id],
      );
      wsUpdated++;
    } else {
      // INSERT: new game, default is_active=true so it appears in Games Library
      await pool.query(
        `INSERT INTO website_games
           (provider_id, game_code, game_name, category, is_active,
            source, api_provider, api_data, display_order)
         VALUES ($1,$2,$3,$4,TRUE,'api',$5,$6,0)`,
        [websiteProviderId, game.game_code, game.name, category, upperCode, apiData],
      );
      wsInserted++;
    }
  }

  // ── 6. Audit log entry ────────────────────────────────────────────────────
  await pool.query(
    `INSERT INTO gp_config_audit_log
       (provider_id, provider_code, admin_id, admin_username, action, notes)
     VALUES ($1,$2,$3,$4,'GAME_SYNC',$5)`,
    [
      provider.id, upperCode, payload.sub, payload.username,
      `Synced ${games.length} games — gp_games: +${gpInserted} ~${gpUpdated} -${gpDeactivated ?? 0}; website_games: +${wsInserted} ~${wsUpdated}`,
    ],
  );

  return NextResponse.json({
    ok:        true,
    total:     games.length,
    gp_games:  { inserted: gpInserted, updated: gpUpdated, deactivated: gpDeactivated ?? 0 },
    website_games: { inserted: wsInserted, updated: wsUpdated },
    website_provider_linked: websiteProviderId !== null,
    synced_at: new Date().toISOString(),
  });
}

// Maps internal GAME_TYPE enum to website_games category CHECK constraint values
function mapToWebsiteCategory(gameType: number): 'slot' | 'live' | 'sport' | 'fishing' {
  switch (gameType) {
    case GAME_TYPE.SLOT:        return 'slot';
    case GAME_TYPE.ARCADE:      return 'slot';
    case GAME_TYPE.TABLE:       return 'live';
    case GAME_TYPE.FISHING:     return 'fishing';
    case GAME_TYPE.LIVE_CASINO: return 'live';
    default:                    return 'slot';
  }
}
