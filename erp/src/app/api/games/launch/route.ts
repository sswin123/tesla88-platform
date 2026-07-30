import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { adjustWallet } from '@/lib/services/wallet';
import { TransactionRepository } from '@/lib/providers/repositories/TransactionRepository';
import { ActivityLogService } from '@/lib/services/activity-log';

const SYSTEM_ADMIN_ID = parseInt(process.env.GAME_SYSTEM_ADMIN_ID ?? '1', 10);
const txRepo = new TransactionRepository();

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
    status: string; website_launch_mode: string; wallet_type: string;
  }>(
    `SELECT id, code, display_name, status, website_launch_mode, wallet_type
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

  // ── 6. Transfer Wallet: autoWithdrawAll (consolidate) + Transfer In ─────────
  // Architecture:
  //   Step A — autoWithdrawAll: recover any remaining provider balance → wallet
  //   Step B — Transfer In: move ALL wallet balance → provider
  // Login Callback: authentication only, never touches wallet.
  // Refresh Button: Transfer Out only (member-wallet-sync route).
  if (provider.wallet_type === 'TRANSFER') {
    const loginId = playerRecord.provider_player_id;
    if (!loginId) {
      console.warn(`[games/launch] Transfer Wallet skipped: no provider_player_id for userId=${user_id}`);
    } else {
      const ts = Date.now();

      type XferAdapter = {
        topUp:            (p: { provider_player_id: string; amount: number; reference_id: string; currency: string }) => Promise<{ balance: number }>;
        autoWithdrawAll?: (loginId: string) => Promise<number>;
      };
      const xferAdapter = adapter as unknown as XferAdapter;

      // ── Step A: autoWithdrawAll — recover any remaining provider balance ───
      let recovered = 0;
      try {
        if (typeof xferAdapter.autoWithdrawAll === 'function') {
          recovered = await xferAdapter.autoWithdrawAll(loginId);
          console.log(`[games/launch] autoWithdrawAll returned=${recovered}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('37123')) {
          console.log(`[games/launch] provider wallet already empty (37123) — OK`);
        } else {
          console.warn(`[games/launch] autoWithdrawAll error (non-fatal): ${msg}`);
        }
      }

      if (recovered > 0) {
        const wdRefId  = `${upperCode}WD-PLAY-${user_id}-${ts}`;
        const wdClient = await pool.connect();
        try {
          await wdClient.query('BEGIN');
          const wtRow = await adjustWallet(wdClient, {
            userId:          user_id,
            type:            'PAYMENT_GATEWAY',
            direction:       'C',
            amount:          recovered,
            gateway:         upperCode,
            referenceNumber: wdRefId,
            remark:          `[${upperCode}] Transfer Out (before Play)`,
            operatorAdminId: SYSTEM_ADMIN_ID,
          });
          await wdClient.query('COMMIT');
          const wdBefore = parseFloat(wtRow.balance_before);
          const wdAfter  = parseFloat(wtRow.balance_after);
          console.log(`[games/launch] ✓ recovered ${recovered}: wallet ${wdBefore} → ${wdAfter}`);

          await txRepo.create({
            provider:       upperCode,
            transaction_id: wtRow.id,
            reference_id:   wdRefId,
            type:           'FUND_RETURN',
            status:         'SUCCESS',
            user_id:        user_id,
            user_public_id: playerRecord.provider_account_id,
            amount:         recovered,
            currency:       'MYR',
            before_balance: wdBefore,
            after_balance:  wdAfter,
            metadata:       { trigger: 'PLAY_BUTTON', step: 'AUTO_WITHDRAW' },
          }).catch(e => console.warn('[games/launch] provider_transactions write failed:', e));

          await ActivityLogService.log({
            member_id:      user_id,
            category:       'BALANCE',
            action:         'Transfer Out',
            title:          `${provider.display_name} — Transfer Out (before Play)`,
            description:    `Recovered RM ${recovered.toFixed(2)} from ${provider.display_name} before Transfer In`,
            amount:         recovered,
            balance_before: wdBefore,
            balance_after:  wdAfter,
            reference_type: 'wallet_transaction',
            reference_id:   parseInt(wtRow.id, 10) || null,
            operator_type:  'MEMBER',
            operator_id:    user_id,
            source:         'WEBSITE',
            level:          'INFO',
            remark:         `[${upperCode}] Transfer Out via Play Button`,
            metadata:       { provider_code: upperCode, recovered, ref_id: wdRefId },
          });
        } catch (e) {
          await wdClient.query('ROLLBACK').catch(() => undefined);
          console.error(`[games/launch] ✗ credit (after autoWithdrawAll) failed:`, e);
        } finally {
          wdClient.release();
        }
      }

      // ── Step B: read fresh balance (includes any recovered amount) ─────────
      const { rows: balRows } = await pool.query<{ available_balance: string }>(
        `SELECT available_balance FROM users WHERE id = $1 LIMIT 1`,
        [user_id],
      );
      const balance = parseFloat(balRows[0]?.available_balance ?? '0');
      console.log(`[games/launch] Transfer In: userId=${user_id} balance=${balance} loginId="${loginId}"`);

      if (balance > 0) {
        const refId = `${upperCode}UP-${user_id}-${ts}`;
        let deductOk  = false;
        let deductWtRow: Awaited<ReturnType<typeof adjustWallet>> | null = null;

        const deductClient = await pool.connect();
        try {
          await deductClient.query('BEGIN');
          deductWtRow = await adjustWallet(deductClient, {
            userId:          user_id,
            type:            'PAYMENT_GATEWAY',
            direction:       'D',
            amount:          balance,
            gateway:         upperCode,
            referenceNumber: refId,
            remark:          `[${upperCode}] Transfer In`,
            operatorAdminId: SYSTEM_ADMIN_ID,
          });
          await deductClient.query('COMMIT');
          deductOk = true;
          const balBefore = parseFloat(deductWtRow.balance_before);
          const balAfter  = parseFloat(deductWtRow.balance_after);
          console.log(`[games/launch] ✓ deduction: ${balBefore} → ${balAfter}`);

          await txRepo.create({
            provider:       upperCode,
            transaction_id: deductWtRow.id,
            reference_id:   refId,
            type:           'FUND_REQUEST',
            status:         'PENDING',
            user_id:        user_id,
            user_public_id: playerRecord.provider_account_id,
            amount:         balance,
            currency:       'MYR',
            before_balance: balBefore,
            after_balance:  balAfter,
            metadata:       { trigger: 'PLAY_BUTTON', step: 'DEDUCT' },
          }).catch(e => console.warn('[games/launch] provider_transactions write failed:', e));
        } catch (err) {
          await deductClient.query('ROLLBACK').catch(() => undefined);
          console.error(`[games/launch] ✗ deduction failed:`, err);
        } finally {
          deductClient.release();
        }

        if (deductOk && deductWtRow) {
          const deductBalBefore = parseFloat(deductWtRow.balance_before);
          const deductBalAfter  = parseFloat(deductWtRow.balance_after);
          let topUpOk    = false;
          let topUpError = '';

          try {
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                console.log(`[games/launch] topUp attempt ${attempt}/3 loginId="${loginId}" amount=${balance}`);
                const topUpResult = await xferAdapter.topUp({
                  provider_player_id: loginId,
                  amount:             balance,
                  reference_id:       refId,
                  currency:           'MYR',
                });
                topUpOk = true;
                console.log(`[games/launch] ✓ topUp SUCCESS: provider balance=${topUpResult.balance}`);

                await txRepo.create({
                  provider:       upperCode,
                  transaction_id: randomUUID(),
                  reference_id:   refId,
                  type:           'FUND_REQUEST',
                  status:         'SUCCESS',
                  user_id:        user_id,
                  user_public_id: playerRecord.provider_account_id,
                  amount:         balance,
                  currency:       'MYR',
                  before_balance: deductBalBefore,
                  after_balance:  topUpResult.balance,
                  metadata:       { trigger: 'PLAY_BUTTON', step: 'TOPUP', provider_balance: topUpResult.balance },
                }).catch(e => console.warn('[games/launch] provider_transactions write failed:', e));

                await ActivityLogService.log({
                  member_id:      user_id,
                  category:       'BALANCE',
                  action:         'Transfer In',
                  title:          `${provider.display_name} — Transfer In`,
                  description:    `Transferred RM ${balance.toFixed(2)} to ${provider.display_name}`,
                  amount:         balance,
                  balance_before: deductBalBefore,
                  balance_after:  deductBalAfter,
                  reference_type: 'wallet_transaction',
                  reference_id:   parseInt(deductWtRow.id, 10) || null,
                  operator_type:  'MEMBER',
                  operator_id:    user_id,
                  source:         'WEBSITE',
                  level:          'INFO',
                  remark:         `[${upperCode}] Transfer In via Play Button`,
                  metadata:       { provider_code: upperCode, amount: balance, ref_id: refId },
                });
                break;
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`[games/launch] topUp attempt ${attempt} FAILED: ${msg}`);
                if (msg.includes('37153') && attempt < 3) {
                  await new Promise(r => setTimeout(r, 3000 * attempt));
                  continue;
                }
                topUpError = msg;
                throw err;
              }
            }
          } catch (err) {
            const errMsg = topUpError || (err instanceof Error ? err.message : String(err));
            console.error(`[games/launch] ✗ topUp FAILED — rolling back userId=${user_id} amount=${balance}`);

            const rbClient = await pool.connect();
            try {
              await rbClient.query('BEGIN');
              const rbWtRow = await adjustWallet(rbClient, {
                userId:          user_id,
                type:            'CORRECTION',
                direction:       'C',
                amount:          balance,
                gateway:         upperCode,
                referenceNumber: `${upperCode}UP-ROLLBACK-${user_id}-${ts}`,
                remark:          `[${upperCode}] Rollback`,
                operatorAdminId: SYSTEM_ADMIN_ID,
              });
              await rbClient.query('COMMIT');
              console.log(`[games/launch] ✓ rollback complete: balance restored to ${parseFloat(rbWtRow.balance_after)}`);

              await ActivityLogService.log({
                member_id:      user_id,
                category:       'BALANCE',
                action:         'Rollback',
                title:          `${provider.display_name} — Transfer In Rollback`,
                description:    `RM ${balance.toFixed(2)} restored after topUp failure: ${errMsg.slice(0, 100)}`,
                amount:         balance,
                balance_before: parseFloat(rbWtRow.balance_before),
                balance_after:  parseFloat(rbWtRow.balance_after),
                reference_type: 'wallet_transaction',
                reference_id:   parseInt(rbWtRow.id, 10) || null,
                operator_type:  'SYSTEM',
                operator_id:    SYSTEM_ADMIN_ID,
                source:         'WEBSITE',
                level:          'WARNING',
                remark:         `[${upperCode}] Rollback`,
                metadata:       { provider_code: upperCode, amount: balance, error: errMsg.slice(0, 255) },
              });
            } catch (rbErr) {
              await rbClient.query('ROLLBACK').catch(() => undefined);
              console.error(`[games/launch] ✗✗ CRITICAL: rollback FAILED userId=${user_id} — MANUAL INTERVENTION REQUIRED: missing ${balance} MYR`);
            } finally {
              rbClient.release();
            }
          }

          if (!topUpOk) {
            console.warn(`[games/launch] Transfer In FAILED: userId=${user_id} amount=${balance} refId=${refId}`);
          }
        }
      }
    }
  }

  return NextResponse.json({
    ok:            true,
    launch_url:    launchResult.launch_url,
    session_token: launchResult.session_token ?? null,
    provider_code: upperCode,
    launch_mode:   provider.website_launch_mode ?? 'LOBBY',
  });
}
