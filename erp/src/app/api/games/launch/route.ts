import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getKiss918Adapter } from '@/lib/gaming';

/**
 * POST /api/games/launch  (Internal service API)
 *
 * Called by the website to generate a provider launch URL for a member.
 * Never called directly by the browser.
 *
 * Auth: X-Service-Secret header must match REVALIDATE_SECRET env var.
 *
 * Body:
 *   { user_id, provider_code, game_code?, lobby_return_url? }
 *
 * Response:
 *   { ok: true, launch_url, provider_code, launch_mode }
 *
 * Player auto-registration:
 *   If this is the first time the member launches this provider, we
 *   register them on the provider side and create a gp_players record.
 */
export async function POST(req: NextRequest) {
  // ── Service-to-service auth ──────────────────────────────────────────────
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get('x-service-secret') !== secret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { user_id?: number; provider_code?: string; game_code?: string | null; lobby_return_url?: string };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const { user_id, provider_code, game_code = null, lobby_return_url = '' } = body;

  if (!user_id || !provider_code) {
    return NextResponse.json({ error: 'user_id and provider_code are required' }, { status: 400 });
  }

  const upperCode = provider_code.toUpperCase();

  // ── 1. Load provider record ───────────────────────────────────────────────
  const { rows: provRows } = await pool.query<{
    id: number; code: string; display_name: string;
    status: string; website_launch_mode: string;
  }>(
    `SELECT id, code, display_name, status, website_launch_mode
     FROM gp_providers WHERE code = $1 LIMIT 1`,
    [upperCode],
  );
  const provider = provRows[0];
  if (!provider) return NextResponse.json({ error: `Provider "${upperCode}" not found` }, { status: 404 });

  if (provider.status !== 'ACTIVE' && provider.status !== 'TESTING') {
    return NextResponse.json(
      { error: `Provider "${upperCode}" is ${provider.status} — cannot launch` },
      { status: 503 },
    );
  }

  // ── 2. Load user info ─────────────────────────────────────────────────────
  const { rows: userRows } = await pool.query<{ id: number; first_name: string; phone: string | null }>(
    `SELECT id, first_name, phone FROM users WHERE id = $1 LIMIT 1`,
    [user_id],
  );
  const user = userRows[0];
  if (!user) return NextResponse.json({ error: `User ${user_id} not found` }, { status: 404 });

  // ── 3. Get adapter ────────────────────────────────────────────────────────
  // Only 918KISS is implemented; future providers follow the same pattern.
  if (upperCode !== '918KISS') {
    return NextResponse.json({ error: `Adapter for "${upperCode}" not yet implemented` }, { status: 422 });
  }

  const adapter = await getKiss918Adapter();
  if (!adapter) {
    return NextResponse.json(
      { error: 'Gaming adapter not initialized. Check provider status and credentials.' },
      { status: 503 },
    );
  }

  // ── 4. Auto-register player if needed ────────────────────────────────────
  const { rows: playerRows } = await pool.query<{
    id: number; provider_player_id: string | null; provider_account_id: string;
    currency: string; is_registered: boolean;
  }>(
    `SELECT id, provider_player_id, provider_account_id, currency, is_registered
     FROM gp_players WHERE provider_id = $1 AND user_id = $2 LIMIT 1`,
    [provider.id, user_id],
  );

  let playerRecord = playerRows[0];

  if (!playerRecord) {
    // Build account_id: "u{userId}@{postfix_id}"
    const { rows: cfgRows } = await pool.query<{ key: string; value: string }>(
      `SELECT key, value FROM gp_config WHERE provider_id = $1 AND key IN ('postfix_id', 'currency')`,
      [provider.id],
    );
    const cfg = Object.fromEntries(cfgRows.map(r => [r.key, r.value]));
    const postfix     = cfg['postfix_id'] ?? '';
    const currency    = cfg['currency'] ?? 'MYR';
    const accountId   = postfix ? `u${user_id}@${postfix}` : `u${user_id}`;
    const nickname    = user.first_name ?? `Player${user_id}`;

    // Call provider API to create the player account
    let providerPlayerId: string | null = null;
    try {
      const result = await adapter.createPlayer({
        account_id: accountId,
        nickname,
        currency,
      });
      providerPlayerId = result.provider_player_id;
    } catch (err) {
      // If player already exists on provider side (e.g. after DB reset), try checkPlayer
      console.warn(`[games/launch] createPlayer failed: ${err instanceof Error ? err.message : String(err)} — attempting checkPlayer`);
      try {
        const pid = await adapter.getPlayerID(accountId);
        providerPlayerId = pid;
      } catch (err2) {
        console.error('[games/launch] getPlayerID also failed:', err2);
        return NextResponse.json(
          { error: 'Failed to register player with gaming provider. Please try again.' },
          { status: 502 },
        );
      }
    }

    // Persist to gp_players
    const { rows: inserted } = await pool.query<{
      id: number; provider_player_id: string | null; provider_account_id: string;
      currency: string; is_registered: boolean;
    }>(
      `INSERT INTO gp_players
         (provider_id, user_id, provider_player_id, provider_account_id, currency,
          is_registered, registered_at)
       VALUES ($1,$2,$3,$4,$5,TRUE,NOW())
       ON CONFLICT (provider_id, user_id) DO UPDATE
         SET provider_player_id = EXCLUDED.provider_player_id,
             is_registered      = TRUE,
             registered_at      = NOW(),
             updated_at         = NOW()
       RETURNING id, provider_player_id, provider_account_id, currency, is_registered`,
      [provider.id, user_id, providerPlayerId, accountId, currency],
    );
    playerRecord = inserted[0];
  } else if (!playerRecord.is_registered || !playerRecord.provider_player_id) {
    // Record exists but not properly registered — try checkPlayer to fill in IDs
    try {
      const pid = await adapter.getPlayerID(playerRecord.provider_account_id);
      await pool.query(
        `UPDATE gp_players SET provider_player_id=$1, is_registered=TRUE, registered_at=NOW(), updated_at=NOW()
         WHERE id=$2`,
        [pid, playerRecord.id],
      );
      playerRecord = { ...playerRecord, provider_player_id: pid, is_registered: true };
    } catch {
      // Non-fatal: launch might still work
    }
  }

  // ── 5. Launch ─────────────────────────────────────────────────────────────
  try {
    const result = await adapter.launch({
      user_id,
      provider_id: provider.id,
      game_code:   game_code ?? null,
      language:    2,           // Mandarin
      lobby_return_url: lobby_return_url || '',
    });

    return NextResponse.json({
      ok:           true,
      launch_url:   result.launch_url,
      provider_code: upperCode,
      launch_mode:  provider.website_launch_mode ?? 'LOBBY',
    });
  } catch (err) {
    console.error('[games/launch] adapter.launch failed:', err);
    return NextResponse.json(
      { error: `Launch failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
