import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { adjustWallet } from '@/lib/services/wallet';
import { TransactionRepository } from '@/lib/providers/repositories/TransactionRepository';
import { GamingActivityService } from '@/lib/services/gaming-activity';
import { GamingEventType } from '@/lib/providers/types/metadata.types';

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
 * Runtime source: ProviderRuntimeBuilder is the single source of truth for
 * all provider adapters, credentials, config, and metadata.
 * Exception: 918KISS remains on the legacy path until Phase 2.
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

  // ── 1. Load user ──────────────────────────────────────────────────────────
  const { rows: userRows } = await pool.query<{ id: number; first_name: string; phone: string | null }>(
    `SELECT id, first_name, phone FROM users WHERE id = $1 LIMIT 1`,
    [user_id],
  );
  const user = userRows[0];
  if (!user) return NextResponse.json({ error: `User ${user_id} not found` }, { status: 404 });

  // ── 2. Load provider + adapter ────────────────────────────────────────────
  // All variables populated by whichever branch runs (918KISS legacy vs brand framework).
  let adapter: import('@/lib/providers').IGameProvider;
  let activeBrandCode: string | null = null;
  let gpProviderId: number;
  let gpWebsiteLaunchMode: string;
  let walletType: string;
  let runtimeConfig: Record<string, string> = {};

  {
    // ── Brand framework path — ProviderRuntimeBuilder is the single runtime source ──
    // All providers (918KISS, MEGAAPP, MEGAH5, …) use this unified path.

    // Find which brand has this provider configured (ACTIVE or TESTING status).
    const { rows: bpFindRows } = await pool.query<{ brand_code: string }>(
      `SELECT b.code AS brand_code
       FROM brand_providers bp
       JOIN brands      b ON b.id  = bp.brand_id
       JOIN gp_providers p ON p.id = bp.provider_id
       WHERE UPPER(p.code) = $1
         AND bp.status IN ('ACTIVE', 'TESTING')
       ORDER BY (bp.status = 'ACTIVE') DESC, bp.id ASC
       LIMIT 1`,
      [upperCode],
    );

    if (!bpFindRows[0]) {
      // Fetch any record (regardless of status) for a more specific error message.
      const { rows: anyRows } = await pool.query<{ brand_code: string; bp_status: string }>(
        `SELECT b.code AS brand_code, bp.status AS bp_status
         FROM brand_providers bp
         JOIN brands      b ON b.id  = bp.brand_id
         JOIN gp_providers p ON p.id = bp.provider_id
         WHERE UPPER(p.code) = $1
         ORDER BY bp.id ASC LIMIT 1`,
        [upperCode],
      );
      const errMsg = anyRows[0]
        ? `Provider "${upperCode}" is ${anyRows[0].bp_status} — go to Brand Center › ${anyRows[0].brand_code} › ${upperCode} and set Status to ACTIVE.`
        : `Provider "${upperCode}" has no brand configuration. Enable it in Brand Center first.`;
      return NextResponse.json({ error: errMsg }, { status: 503 });
    }

    activeBrandCode = bpFindRows[0].brand_code;

    const { createGamingPlatform, ProviderRepository } = await import('@/lib/providers');
    const { ProviderRuntimeBuilder } = await import('@/lib/providers/core/ProviderRuntimeBuilder');
    const platform     = createGamingPlatform();
    const providerRepo = new ProviderRepository();

    const result = await ProviderRuntimeBuilder.build(
      activeBrandCode,
      upperCode,
      (v) => platform.security.decrypt(v),
      { wallet: platform.wallet, eventLogger: platform.eventLogger, providerRepo },
      false,
    );

    if (!result.found || !result.adapterBuilt || !result.adapter) {
      return NextResponse.json(
        { error: `Provider "${upperCode}" could not be initialized. Check credentials in Brand Center.` },
        { status: 503 },
      );
    }

    gpProviderId        = result.gpProviderId;
    gpWebsiteLaunchMode = result.gpWebsiteLaunchMode;
    walletType          = result.bpWalletType;
    runtimeConfig       = result.config;
    adapter             = result.adapter;
  }

  // ── 3. Auto-register player if needed ────────────────────────────────────
  const { rows: playerRows } = await pool.query<{
    id: number; provider_player_id: string | null; provider_account_id: string;
    currency: string; is_registered: boolean;
  }>(
    `SELECT id, provider_player_id, provider_account_id, currency, is_registered
     FROM gp_players WHERE provider_id = $1 AND user_id = $2 LIMIT 1`,
    [gpProviderId, user_id],
  );

  let playerRecord = playerRows[0];

  if (!playerRecord) {
    // Build account_id: "u{userId}{postfix_id}"
    // postfix_id already contains '@' (e.g. '@opulux'), so no extra '@' here.
    const postfix  = runtimeConfig['postfix_id'] ?? '';
    const currency = runtimeConfig['currency'] ?? 'MYR';

    const accountId = postfix ? `u${user_id}${postfix}` : `u${user_id}`;
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
      [gpProviderId, user_id, providerPlayerId, accountId, currency],
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

  // ── Record GAME_LAUNCH_START ───────────────────────────────────────────────
  // Await here to get the traceId — all subsequent events in this session share it.
  const { traceId: launchTraceId } = await GamingActivityService.record({
    memberId:     user_id,
    providerCode: upperCode,
    eventType:    GamingEventType.LaunchStart,
    operatorType: 'MEMBER',
    operatorId:   user_id,
    metadata:     { game_code: game_code ?? null, wallet_type: walletType },
  });

  // ── 4. Launch ─────────────────────────────────────────────────────────────
  let launchResult: import('@/lib/providers').LaunchResult;
  try {
    launchResult = await adapter.launch({
      user_id,
      provider_id: gpProviderId,
      game_code:   game_code ?? null,
      language:    2,           // Mandarin
      lobby_return_url: lobby_return_url || '',
    });
  } catch (err) {
    console.error('[games/launch] adapter.launch failed:', err);
    void GamingActivityService.record({
      memberId:     user_id,
      providerCode: upperCode,
      eventType:    GamingEventType.LaunchFailed,
      traceId:      launchTraceId,
      operatorType: 'MEMBER',
      operatorId:   user_id,
      metadata:     { error: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json(
      { error: `Launch failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  // ── 5. Transfer Wallet: autoWithdrawAll (consolidate) + Transfer In ─────────
  // Architecture:
  //   Step A — autoWithdrawAll: recover any remaining provider balance → wallet
  //   Step B — Transfer In: move ALL wallet balance → provider
  // Login Callback: authentication only, never touches wallet.
  // Refresh Button: Transfer Out only (member-wallet-sync route).
  if (walletType === 'TRANSFER') {
    const loginId = launchResult.provider_login_id ?? playerRecord.provider_player_id;
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

          // AFTER COMMIT — Transfer Out (before Transfer In)
          void GamingActivityService.record({
            memberId:      user_id,
            providerCode:  upperCode,
            eventType:     GamingEventType.TransferOut,
            traceId:       launchTraceId,
            amount:        recovered,
            balanceBefore: wdBefore,
            balanceAfter:  wdAfter,
            referenceType: 'wallet_transaction',
            referenceId:   parseInt(wtRow.id, 10) || null,
            operatorType:  'MEMBER',
            operatorId:    user_id,
            metadata:      { ref_id: wdRefId, trigger: 'PLAY_BUTTON' },
          });
        } catch (e) {
          await wdClient.query('ROLLBACK').catch(() => undefined);
          console.error(`[games/launch] ✗ credit (after autoWithdrawAll) failed:`, e);
        } finally {
          wdClient.release();
        }
      }

      // ── Launch readiness check (TRANSFER providers only) ─────────────────
      // autoWithdrawAll has already recovered any prior provider balance above.
      // Only proceed with Transfer In if the adapter produced a usable launch
      // URL — an empty launch_url means the provider is not yet configured for
      // web/app launch. Performing a new Transfer In would leave the member's
      // wallet at 0 with no way to enter the game.
      if (!launchResult.launch_url) {
        void GamingActivityService.record({
          memberId:     user_id,
          providerCode: upperCode,
          eventType:    GamingEventType.LaunchFailed,
          traceId:      launchTraceId,
          operatorType: 'MEMBER',
          operatorId:   user_id,
          metadata:     { error: 'launch_url empty — Transfer In blocked, no game entry possible' },
        });
        return NextResponse.json(
          { error: `${upperCode} 游戏启动尚未配置，请联系客服。` },
          { status: 503 },
        );
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

                // AFTER COMMIT — Transfer In success
                void GamingActivityService.record({
                  memberId:      user_id,
                  providerCode:  upperCode,
                  eventType:     GamingEventType.TransferIn,
                  traceId:       launchTraceId,
                  amount:        balance,
                  balanceBefore: deductBalBefore,
                  balanceAfter:  deductBalAfter,
                  referenceType: 'wallet_transaction',
                  referenceId:   parseInt(deductWtRow.id, 10) || null,
                  operatorType:  'MEMBER',
                  operatorId:    user_id,
                  metadata:      { ref_id: refId, trigger: 'PLAY_BUTTON' },
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

              // AFTER COMMIT — Transfer Rollback
              void GamingActivityService.record({
                memberId:      user_id,
                providerCode:  upperCode,
                eventType:     GamingEventType.TransferRollback,
                traceId:       launchTraceId,
                amount:        balance,
                balanceBefore: parseFloat(rbWtRow.balance_before),
                balanceAfter:  parseFloat(rbWtRow.balance_after),
                referenceType: 'wallet_transaction',
                referenceId:   parseInt(rbWtRow.id, 10) || null,
                operatorType:  'SYSTEM',
                operatorId:    SYSTEM_ADMIN_ID,
                metadata:      { error: errMsg.slice(0, 255), original_ref: refId },
              });
            } catch (rbErr) {
              await rbClient.query('ROLLBACK').catch(() => undefined);
              console.error(`[games/launch] ✗✗ CRITICAL: rollback FAILED userId=${user_id} amount=${balance} — MANUAL INTERVENTION REQUIRED: missing ${balance} MYR`);
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

  // Record launch success — URL generated and all Transfer operations attempted
  void GamingActivityService.record({
    memberId:     user_id,
    providerCode: upperCode,
    eventType:    GamingEventType.LaunchSuccess,
    traceId:      launchTraceId,
    operatorType: 'MEMBER',
    operatorId:   user_id,
    metadata:     { launch_mode: gpWebsiteLaunchMode ?? 'LOBBY' },
  });

  return NextResponse.json({
    ok:            true,
    launch_url:    launchResult.launch_url,
    session_token: launchResult.session_token ?? null,
    provider_code: upperCode,
    launch_mode:   gpWebsiteLaunchMode ?? 'LOBBY',
  });
}
