import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

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

  // ── 3. Get adapter (brand-aware for non-918KISS providers) ───────────────────
  let adapter: import('@/lib/providers').IGameProvider;
  let activeBrandCode: string | null = null;

  if (upperCode === '918KISS') {
    // 918KISS: legacy singleton — reads from gp_credentials (unchanged)
    const { getKiss918Adapter } = await import('@/lib/gaming');
    const k918 = await getKiss918Adapter();
    if (!k918) {
      return NextResponse.json(
        { error: 'Gaming adapter not initialized. Check provider status and credentials.' },
        { status: 503 },
      );
    }
    adapter = k918;
  } else {
    // All other providers: brand-aware, reads from brand_provider_credentials
    const { createGamingPlatform } = await import('@/lib/providers');

    // Find which brand has this provider enabled
    // Debug: first query without status filter to see what actually exists
    const { rows: debugRows } = await pool.query<{
      brand_id: number; brand_code: string; bp_id: number; bp_status: string; provider_code: string;
    }>(
      `SELECT b.id AS brand_id, b.code AS brand_code, bp.id AS bp_id,
              bp.status AS bp_status, p.code AS provider_code
       FROM brand_providers bp
       JOIN brands b       ON b.id = bp.brand_id
       JOIN gp_providers p ON p.id = bp.provider_id
       WHERE p.code = $1`,
      [upperCode],
    );
    console.log(`[games/launch] DEBUG brand_providers lookup for provider_code="${upperCode}":`, {
      query_condition: `p.code = '${upperCode}'`,
      rows_found: debugRows.length,
      records: debugRows.map(r => ({
        brand_id:      r.brand_id,
        brand_code:    r.brand_code,
        bp_id:         r.bp_id,
        bp_status:     r.bp_status,
        provider_code: r.provider_code,
      })),
    });

    const bpRows = debugRows.filter(r => r.bp_status === 'ACTIVE');
    console.log(`[games/launch] DEBUG ACTIVE records: ${bpRows.length}/${debugRows.length}`);

    if (!bpRows[0]) {
      const statusSummary = debugRows.length === 0
        ? 'no brand_providers record found at all'
        : `record found but status=${debugRows.map(r => `${r.brand_code}:${r.bp_status}`).join(', ')}`;
      console.warn(`[games/launch] Resolution failed for "${upperCode}": ${statusSummary}`);

      const hasRecord    = debugRows.length > 0;
      const currentStatus = hasRecord ? debugRows[0].bp_status : null;
      const userMessage   = hasRecord
        ? `Provider "${upperCode}" is ${currentStatus} — go to Brand Center › ${debugRows[0].brand_code} › ${upperCode} and set Status to ACTIVE.`
        : `Provider "${upperCode}" has no brand configuration. Enable it in Brand Center first.`;

      return NextResponse.json(
        {
          error: userMessage,
          debug: { provider_code: upperCode, brand_providers_found: debugRows.length, status_summary: statusSummary },
        },
        { status: 503 },
      );
    }
    activeBrandCode = bpRows[0].brand_code;

    try {
      const platform = createGamingPlatform();
      adapter = await platform.brandManager.getAdapter(activeBrandCode, upperCode);
    } catch (err) {
      console.error(`[games/launch] BrandProviderManager.getAdapter failed for ${upperCode}:`, err);
      return NextResponse.json(
        { error: `Adapter for "${upperCode}" could not be initialized. Check credentials in Brand Center.` },
        { status: 503 },
      );
    }
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
    // 918KISS: config lives in gp_config (legacy).
    // All other providers: config lives in brand_provider_config.
    let postfix: string;
    let currency: string;

    if (upperCode === '918KISS') {
      const { rows: cfgRows } = await pool.query<{ key: string; value: string }>(
        `SELECT key, value FROM gp_config WHERE provider_id = $1 AND key IN ('postfix_id', 'currency')`,
        [provider.id],
      );
      const cfg = Object.fromEntries(cfgRows.map(r => [r.key, r.value]));
      postfix  = cfg['postfix_id'] ?? '';
      currency = cfg['currency'] ?? 'MYR';
    } else {
      const { rows: cfgRows } = await pool.query<{ key: string; value: string }>(
        `SELECT bpc.key, bpc.value
         FROM brand_provider_config bpc
         JOIN brand_providers bp ON bp.id = bpc.brand_provider_id
         JOIN brands b ON b.id = bp.brand_id
         JOIN gp_providers p ON p.id = bp.provider_id
         WHERE b.code = $1 AND p.code = $2
           AND bpc.key IN ('postfix_id', 'currency')`,
        [activeBrandCode, upperCode],
      );
      const cfg = Object.fromEntries(cfgRows.map(r => [r.key, r.value]));
      postfix  = cfg['postfix_id'] ?? '';
      currency = cfg['currency'] ?? 'MYR';
    }

    const accountId = postfix ? `u${user_id}@${postfix}` : `u${user_id}`;
    const nickname  = user.first_name ?? `Player${user_id}`;

    // Call provider API to create the player account.
    // For H5 LOBBY providers (e.g. 918KISS), the provider auto-registers the player
    // on first H5 Login — so a failed createPlayer/checkPlayer is non-fatal.
    // We still persist the local gp_players record so adapter.launch() can find
    // the account_id and proceed with getLoginToken().
    let providerPlayerId: string | null = null;
    try {
      const result = await adapter.createPlayer({
        account_id: accountId,
        nickname,
        currency,
      });
      providerPlayerId = result.provider_player_id;
    } catch (err) {
      // Player may already exist on provider side — try checkPlayer first.
      console.warn(`[games/launch] createPlayer failed: ${err instanceof Error ? err.message : String(err)} — attempting checkPlayer`);
      try {
        const pid = await adapter.getPlayerID(accountId);
        providerPlayerId = pid;
      } catch (err2) {
        // H5 providers auto-register on first H5 login — proceed without provider_player_id.
        console.warn(`[games/launch] checkPlayer also failed: ${err2 instanceof Error ? err2.message : String(err2)} — proceeding with H5 auto-registration`);
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
  let launchResult: import('@/lib/providers').LaunchResult;
  try {
    launchResult = await adapter.launch({
      user_id,
      provider_id: provider.id,
      game_code:   game_code ?? null,
      language:    2,           // Mandarin
      lobby_return_url: lobby_return_url || '',
    });
  } catch (err) {
    console.error('[games/launch] adapter.launch failed:', err);
    return NextResponse.json(
      { error: `Launch failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  // ── 6. Transfer Wallet note ───────────────────────────────────────────────
  // For TRANSFER wallet providers (e.g. MEGAAPP), wallet sync is handled
  // exclusively in the MEGA login callback route, NOT here.
  //
  // Doing wallet sync in both launch and callback created a race condition:
  // both could run concurrently (launch generates deeplink → player opens app
  // almost immediately), causing double topUp and phantom balance doubling.
  //
  // The callback fires on every MEGA app login and is the single authoritative
  // sync point (autoWithdrawAll → deduct-first → topUp → rollback on failure).

  return NextResponse.json({
    ok:            true,
    launch_url:    launchResult.launch_url,
    session_token: launchResult.session_token ?? null,
    provider_code: upperCode,
    launch_mode:   provider.website_launch_mode ?? 'LOBBY',
  });
}
