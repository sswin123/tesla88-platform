/**
 * ProviderRuntimeBuilder — Single Source of Truth for Provider Runtime Construction
 *
 * This is the ONLY place in the framework that reads brand_provider_* tables
 * and builds an IGameProvider adapter.  All callers (BrandProviderManager,
 * Connection Test, Reload) must go through this builder.
 *
 * Design contract:
 *  - Always reads fresh from the database (never touches any in-memory cache)
 *  - Decrypts credentials using the supplied decrypt function
 *  - Validates required keys against AdapterRegistry (single source of truth)
 *  - Detects URL-type config keys dynamically (no hardcoded list per provider)
 *  - Records a DiagnosticStep for every operation
 *  - Never throws — errors are captured in adapterError / build_error fields
 */

import pool from '@/lib/db';
import { AdapterRegistry } from '../adapters/AdapterFactory';
import type { IGameProvider } from '../interfaces/IGameProvider';
import type { AdapterDeps } from '../adapters/AdapterRegistry';
import type { DiagnosticStep } from '../types/runtime.types';

// ── URL pattern detection ──────────────────────────────────────────────────────

/** Config key substrings that indicate a URL / domain value. */
const URL_KEY_PATTERNS = ['url', 'domain', 'endpoint', 'host', 'api', 'lobby', 'game'];

/** Return true if the config key likely holds a URL/domain. */
function isUrlKey(key: string): boolean {
  const lower = key.toLowerCase();
  return URL_KEY_PATTERNS.some(p => lower.includes(p));
}

// ── Result type ────────────────────────────────────────────────────────────────

export interface ProviderRawRow {
  id: number;
  status: string;
  environment: string;
  wallet_type: string;
  currency: string;
  health_status: string;
  health_checked_at: string | null;
  last_success_at: string | null;
  last_failed_at: string | null;
  gp_provider_id: number;
  gp_display_name: string;
  gp_website_launch_mode: string;
}

export interface DecryptError {
  key: string;
  error: string;
}

/**
 * Complete result of building a provider runtime from the database.
 * Every field is always present — callers don't need to check for undefined.
 */
export interface RuntimeBuildResult {
  /** True only when brand_providers row was found. */
  found: boolean;

  // ── Raw DB row ──────────────────────────────────────────────────────────────
  bpId: number;
  bpStatus: string;
  bpEnvironment: string;
  bpWalletType: string;
  bpCurrency: string;
  bpHealthStatus: string;
  bpHealthCheckedAt: string | null;
  bpLastSuccessAt: string | null;
  bpLastFailedAt: string | null;

  // ── Provider metadata (from gp_providers via JOIN) ──────────────────────────
  /** gp_providers.id — use as FK for gp_players; never query gp_providers separately. */
  gpProviderId: number;
  gpDisplayName: string;
  gpWebsiteLaunchMode: string;

  // ── Configuration ───────────────────────────────────────────────────────────
  /** Raw key→value from brand_provider_config (not decrypted — config is plain text). */
  config: Record<string, string>;
  configCount: number;
  requiredConfigKeys: string[];
  missingConfigKeys: string[];
  /** Config keys whose name matches URL/domain patterns (used by Connection Test). */
  urlConfigKeys: string[];

  // ── Credentials ─────────────────────────────────────────────────────────────
  /** Decrypted key→value map. Keys with decrypt errors have value ''. */
  credentials: Record<string, string>;
  credCount: number;
  requiredCredKeys: string[];
  missingCredKeys: string[];
  decryptErrors: DecryptError[];

  // ── Adapter ─────────────────────────────────────────────────────────────────
  adapter: IGameProvider | null;
  adapterBuilt: boolean;
  adapterError: string | null;
  adapterVersion: string;
  /** True if a factory is registered in AdapterRegistry for this providerCode. */
  adapterRegistered: boolean;

  // ── Game catalog ────────────────────────────────────────────────────────────
  gamesSynced: number;

  // ── Diagnostics ─────────────────────────────────────────────────────────────
  diagnostics: DiagnosticStep[];
  buildDurationMs: number;
  builtAt: string;
}

// ── Builder ────────────────────────────────────────────────────────────────────

export class ProviderRuntimeBuilder {
  /**
   * Build a complete provider runtime from the database.
   *
   * @param brandCode    Brand code (case-insensitive — normalised to upper)
   * @param providerCode Provider code (case-insensitive — normalised to upper)
   * @param decrypt      Function to decrypt an encrypted credential value
   * @param deps         IGameProvider dependencies (wallet, eventLogger, providerRepo)
   * @param includeGames Whether to count synced games (default true; set false for speed)
   */
  static async build(
    brandCode:    string,
    providerCode: string,
    decrypt:      (ciphertext: string) => string,
    deps:         AdapterDeps,
    includeGames  = true,
  ): Promise<RuntimeBuildResult> {
    const brand    = brandCode.toUpperCase();
    const provider = providerCode.toUpperCase();
    const builtAt  = new Date().toISOString();
    const t0       = Date.now();

    const diagnostics: DiagnosticStep[] = [];
    function step(name: string, status: DiagnosticStep['status'], ms: number, detail: string | null = null) {
      diagnostics.push({ step: name, status, duration_ms: ms, detail });
    }

    // Empty result for "not found" cases
    const empty = (reason: string): RuntimeBuildResult => ({
      found: false,
      bpId: -1, bpStatus: 'UNKNOWN', bpEnvironment: 'UNKNOWN',
      bpWalletType: 'UNKNOWN', bpCurrency: 'MYR', bpHealthStatus: 'UNKNOWN',
      bpHealthCheckedAt: null, bpLastSuccessAt: null, bpLastFailedAt: null,
      gpProviderId: -1, gpDisplayName: '', gpWebsiteLaunchMode: 'LOBBY',
      config: {}, configCount: 0,
      requiredConfigKeys: AdapterRegistry.getRequiredConfig(provider),
      missingConfigKeys: AdapterRegistry.getRequiredConfig(provider),
      urlConfigKeys: [],
      credentials: {}, credCount: 0,
      requiredCredKeys: AdapterRegistry.getRequiredCredentials(provider),
      missingCredKeys: AdapterRegistry.getRequiredCredentials(provider),
      decryptErrors: [],
      adapter: null, adapterBuilt: false, adapterError: reason,
      adapterVersion: AdapterRegistry.getVersion(provider),
      adapterRegistered: AdapterRegistry.isRegistered(provider),
      gamesSynced: 0,
      diagnostics,
      buildDurationMs: Date.now() - t0,
      builtAt,
    });

    // ── Step 1: brand_providers row ──────────────────────────────────────────
    let t = Date.now();
    let bpRow: ProviderRawRow;
    try {
      // [DIAG] 先查出所有匹配行（无 LIMIT），用于检测重复行
      const { rows: allRows } = await pool.query<{
        id: number; status: string; wallet_type: string; brand_id: number; provider_id: number;
      }>(
        `SELECT bp.id, bp.status, bp.wallet_type, bp.brand_id, bp.provider_id
         FROM brand_providers bp
         JOIN brands       b ON b.id = bp.brand_id
         JOIN gp_providers p ON p.id = bp.provider_id
         WHERE UPPER(b.code) = $1 AND UPPER(p.code) = $2
         ORDER BY bp.id ASC`,
        [brand, provider],
      );
      console.log('[PRB-ALL-ROWS]', { brand, provider, count: allRows.length, rows: allRows });

      const { rows } = await pool.query<ProviderRawRow>(
        `SELECT bp.id,
                bp.status,
                bp.environment,
                bp.wallet_type,
                bp.currency,
                bp.health_status,
                bp.health_checked_at,
                bp.last_success_at,
                bp.last_failed_at,
                p.id                   AS gp_provider_id,
                p.display_name         AS gp_display_name,
                p.website_launch_mode  AS gp_website_launch_mode
         FROM brand_providers  bp
         JOIN brands           b  ON b.id  = bp.brand_id
         JOIN gp_providers     p  ON p.id  = bp.provider_id
         WHERE UPPER(b.code) = $1
           AND UPPER(p.code) = $2
         LIMIT 1`,
        [brand, provider],
      );
      if (!rows[0]) {
        step('read_brand_provider', 'failed', Date.now() - t,
          `No brand_provider row: brand=${brand} provider=${provider}`);
        return empty(`Brand provider not found: ${brand}:${provider}`);
      }
      bpRow = rows[0];
      console.log('[PRB-SELECTED]', { bpId: bpRow.id, wallet_type: bpRow.wallet_type, status: bpRow.status, gp_provider_id: bpRow.gp_provider_id });
      step('read_brand_provider', 'ok', Date.now() - t, `bpId=${bpRow.id} status=${bpRow.status} gpId=${bpRow.gp_provider_id}`);
    } catch (err) {
      step('read_brand_provider', 'failed', Date.now() - t,
        err instanceof Error ? err.message : String(err));
      return empty(`DB error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── Step 2: Configuration ────────────────────────────────────────────────
    t = Date.now();
    const config: Record<string, string> = {};
    let configCount = 0;
    try {
      const { rows: cfgRows } = await pool.query<{ key: string; value: string }>(
        `SELECT key, value FROM brand_provider_config WHERE brand_provider_id = $1`,
        [bpRow.id],
      );
      for (const r of cfgRows) config[r.key] = r.value;
      configCount = cfgRows.length;
      step('load_config', 'ok', Date.now() - t, `${configCount} keys: [${Object.keys(config).join(', ')}]`);
    } catch (err) {
      step('load_config', 'failed', Date.now() - t,
        err instanceof Error ? err.message : String(err));
    }

    const requiredConfigKeys  = AdapterRegistry.getRequiredConfig(provider);
    const presentConfigKeySet = new Set(Object.keys(config));
    const missingConfigKeys   = requiredConfigKeys.filter(k => !presentConfigKeySet.has(k));

    // URL-type keys: any config key whose name looks like a URL/domain
    const urlConfigKeys = Object.keys(config).filter(isUrlKey);

    // ── Step 3: Credentials ──────────────────────────────────────────────────
    t = Date.now();
    const credentials: Record<string, string> = {};
    const decryptErrors: DecryptError[] = [];
    let credCount = 0;
    try {
      const { rows: credRows } = await pool.query<{
        key: string; value: string; is_encrypted: boolean;
      }>(
        `SELECT key, value, is_encrypted FROM brand_provider_credentials WHERE brand_provider_id = $1`,
        [bpRow.id],
      );
      credCount = credRows.length;
      for (const r of credRows) {
        try {
          credentials[r.key] = r.is_encrypted ? decrypt(r.value) : r.value;
        } catch (err) {
          credentials[r.key] = '';
          decryptErrors.push({ key: r.key, error: err instanceof Error ? err.message : 'decrypt failed' });
        }
      }
      const detail = `${credCount} keys: [${Object.keys(credentials).join(', ')}]`
        + (decryptErrors.length ? ` decrypt_errors=[${decryptErrors.map(e => e.key).join(', ')}]` : '');
      step('load_credentials', decryptErrors.length > 0 ? 'failed' : 'ok', Date.now() - t, detail);
    } catch (err) {
      step('load_credentials', 'failed', Date.now() - t,
        err instanceof Error ? err.message : String(err));
    }

    const requiredCredKeys  = AdapterRegistry.getRequiredCredentials(provider);
    const presentCredKeySet = new Set(Object.keys(credentials));
    const missingCredKeys   = requiredCredKeys.filter(k => !presentCredKeySet.has(k));

    // ── Step 4: Build adapter ────────────────────────────────────────────────
    t = Date.now();
    let adapter: IGameProvider | null = null;
    let adapterBuilt = false;
    let adapterError: string | null = null;
    const adapterVersion = AdapterRegistry.getVersion(provider);
    const adapterRegistered = AdapterRegistry.isRegistered(provider);

    if (!adapterRegistered) {
      adapterError = `No adapter registered for "${provider}". Known: ${AdapterRegistry.getRegisteredCodes().join(', ')}`;
      step('build_adapter', 'failed', Date.now() - t, adapterError);
    } else if (credCount === 0) {
      adapterError = 'No credentials in database';
      step('build_adapter', 'skipped', 0, adapterError);
    } else if (missingCredKeys.length > 0) {
      adapterError = `Missing required credentials: ${missingCredKeys.join(', ')}`;
      step('build_adapter', 'skipped', 0, adapterError);
    } else {
      try {
        adapter = AdapterRegistry.create(provider, credentials, config,
          { ...deps, gpProviderId: bpRow.gp_provider_id });
        adapterBuilt = true;
        step('build_adapter', 'ok', Date.now() - t, `version=${adapterVersion}`);
      } catch (err) {
        adapterError = err instanceof Error ? err.message : String(err);
        step('build_adapter', 'failed', Date.now() - t, adapterError);
      }
    }

    // ── Step 5: Games synced ─────────────────────────────────────────────────
    let gamesSynced = 0;
    if (includeGames) {
      t = Date.now();
      try {
        const { rows: gameRows } = await pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM gp_games gm
           JOIN gp_providers p ON p.id = gm.provider_id
           WHERE UPPER(p.code) = $1`,
          [provider],
        );
        gamesSynced = parseInt(gameRows[0]?.count ?? '0', 10);
        step('count_games', 'ok', Date.now() - t, `games=${gamesSynced}`);
      } catch (err) {
        step('count_games', 'failed', Date.now() - t,
          err instanceof Error ? err.message : String(err));
      }
    }

    console.log('[PRB-FINAL]', { brand, provider, bpId: bpRow.id, bpWalletType: bpRow.wallet_type, adapterBuilt });

    return {
      found: true,
      bpId:              bpRow.id,
      bpStatus:          bpRow.status,
      bpEnvironment:     bpRow.environment,
      bpWalletType:      bpRow.wallet_type,
      bpCurrency:        bpRow.currency,
      bpHealthStatus:    bpRow.health_status,
      bpHealthCheckedAt: bpRow.health_checked_at,
      bpLastSuccessAt:   bpRow.last_success_at,
      bpLastFailedAt:    bpRow.last_failed_at,
      gpProviderId:      bpRow.gp_provider_id,
      gpDisplayName:     bpRow.gp_display_name,
      gpWebsiteLaunchMode: bpRow.gp_website_launch_mode,
      config,
      configCount,
      requiredConfigKeys,
      missingConfigKeys,
      urlConfigKeys,
      credentials,
      credCount,
      requiredCredKeys,
      missingCredKeys,
      decryptErrors,
      adapter,
      adapterBuilt,
      adapterError,
      adapterVersion,
      adapterRegistered,
      gamesSynced,
      diagnostics,
      buildDurationMs: Date.now() - t0,
      builtAt,
    };
  }
}
