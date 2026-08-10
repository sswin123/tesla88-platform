import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';
import { createGamingPlatform } from '@/lib/providers';
import type { GameListItem } from '@/lib/providers/types/game.types';
import { resolveProvider } from '@/lib/games/resolve-provider';

type Params = { params: Promise<{ code: string }> };

/**
 * POST /api/games/settings/[code]/sync
 *
 * Fetches the game catalog from the provider's API and upserts into
 * gp_games (internal catalog only). Website display is controlled by
 * gp_providers.website_visible and does NOT depend on Games Library.
 *
 * Requires: game.manage permission
 * All providers use the brand framework (BrandProviderManager → Adapter).
 */
export async function POST(_req: Request, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code: codeOrId } = await params;

  // ── 1. Find gp_providers record ───────────────────────────────────────────
  const resolved = await resolveProvider(codeOrId);
  if (!resolved) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  const upperCode = resolved.code;

  const { rows: provRows } = await pool.query<{
    id: number; code: string; display_name: string; status: string;
  }>(
    `SELECT id, code, display_name, status FROM gp_providers WHERE id = $1`,
    [resolved.id],
  );
  if (!provRows[0]) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  const provider = provRows[0];

  if (provider.status === 'DISABLED' || provider.status === 'DEPRECATED') {
    return NextResponse.json(
      { error: `Cannot sync games for ${upperCode} — provider status is ${provider.status}` },
      { status: 422 },
    );
  }

  // ── 2. Find active brand for this provider ────────────────────────────────
  const { rows: bpRows } = await pool.query<{ brand_code: string }>(
    `SELECT b.code AS brand_code
     FROM brand_providers bp
     JOIN brands b       ON b.id = bp.brand_id
     JOIN gp_providers p ON p.id = bp.provider_id
     WHERE UPPER(p.code) = $1 AND bp.status IN ('ACTIVE', 'TESTING')
     ORDER BY (bp.status = 'ACTIVE') DESC, bp.id ASC
     LIMIT 1`,
    [upperCode],
  );

  if (!bpRows[0]) {
    return NextResponse.json(
      { error: `No active brand configuration for ${upperCode}. Enable it in Brand Center first.` },
      { status: 503 },
    );
  }

  // ── 3. Get adapter and fetch game list ────────────────────────────────────
  let games: GameListItem[];

  try {
    const platform = createGamingPlatform();
    const adapter = await platform.brandManager.getAdapter(bpRows[0].brand_code, upperCode);
    const result = await adapter.getGameList();
    games = result.games;
  } catch (err) {
    return NextResponse.json(
      { error: `getGameList failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  if (games.length === 0) {
    return NextResponse.json({ ok: true, gp_games: { inserted: 0, updated: 0, deactivated: 0 }, total: 0, synced_at: new Date().toISOString() });
  }

  // ── 4. Upsert into gp_games ───────────────────────────────────────────────
  // Map numeric game_type → category string for the website games API filter.
  // Values match GAME_TYPE constants: 1=SLOT 2=ARCADE 3=TABLE 4=FISHING 5=LIVE_CASINO
  const GAME_TYPE_CATEGORY: Record<number, string> = {
    1: 'slot', 2: 'arcade', 3: 'table', 4: 'fishing', 5: 'live',
  };

  // Count by game_type for diagnostic response
  const byGameType: Record<string | number, number> = {};
  for (const g of games) {
    const t = g.game_type ?? 'unknown';
    byGameType[t] = (byGameType[t] ?? 0) + 1;
  }
  const fishingGames = games.filter(g => g.game_type === 4).map(g => g.game_code);
  const first30 = games.slice(0, 30).map(g => ({ game_type: g.game_type, game_code: g.game_code }));

  let gpInserted = 0;
  let gpUpdated  = 0;

  for (const game of games) {
    const category = GAME_TYPE_CATEGORY[game.game_type as number] ?? 'other';
    const { rows } = await pool.query<{ xmax: string }>(
      `INSERT INTO gp_games
         (provider_id, game_code, name, game_type, sub_type, icon_url, banner_url,
          is_active, metadata, category, synced_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
       ON CONFLICT (provider_id, game_code) DO UPDATE
         SET name       = EXCLUDED.name,
             game_type  = EXCLUDED.game_type,
             sub_type   = EXCLUDED.sub_type,
             icon_url   = EXCLUDED.icon_url,
             banner_url = EXCLUDED.banner_url,
             is_active  = EXCLUDED.is_active,
             metadata   = EXCLUDED.metadata,
             category   = EXCLUDED.category,
             synced_at  = NOW(),
             updated_at = NOW()
       RETURNING (xmax = 0) AS is_insert`,
      [
        provider.id, game.game_code, game.name, game.game_type,
        game.sub_type ?? null, game.icon_url ?? null, game.banner_url ?? null,
        game.is_active ?? true, JSON.stringify(game.metadata ?? {}), category,
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

  // ── 5. Audit log entry ────────────────────────────────────────────────────
  await pool.query(
    `INSERT INTO gp_config_audit_log
       (provider_id, provider_code, admin_id, admin_username, action, notes)
     VALUES ($1,$2,$3,$4,'GAME_SYNC',$5)`,
    [
      provider.id, upperCode, payload.sub, payload.username,
      `Synced ${games.length} games — gp_games: +${gpInserted} ~${gpUpdated} -${gpDeactivated ?? 0}`,
    ],
  );

  return NextResponse.json({
    ok:           true,
    total:        games.length,
    gp_games:     { inserted: gpInserted, updated: gpUpdated, deactivated: gpDeactivated ?? 0 },
    by_game_type: byGameType,   // SLOT/ARCADE/TABLE/FISHING/LIVE_CASINO counts from API
    fishing_games: fishingGames,
    first_30: first30,
    synced_at:    new Date().toISOString(),
  });
}
