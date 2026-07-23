import { createDecipheriv } from 'crypto';
import {
  createGamingPlatform,
  Kiss918Adapter,
  ProviderRepository,
} from '@/lib/providers';
import type { Kiss918Credentials, Kiss918Config } from '@/lib/providers';
import pool from '@/lib/db';

// ── AES-256-GCM Decryption ────────────────────────────────────────────────────
// Mirrors SecurityService.decrypt() exactly:
//   base64-encoded payload = iv(12) + authTag(16) + ciphertext(rest)
// AES_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).
function decryptCredential(encrypted: string): string {
  const hexKey = process.env.AES_ENCRYPTION_KEY;
  if (!hexKey || hexKey.length !== 64) {
    throw new Error(
      'AES_ENCRYPTION_KEY is required and must be a 64-character hex string.',
    );
  }
  const key = Buffer.from(hexKey, 'hex');
  const buf = Buffer.from(encrypted, 'base64');
  const iv       = buf.subarray(0, 12);
  const authTag  = buf.subarray(12, 28);
  const cipher   = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(cipher).toString('utf8') + decipher.final('utf8');
}

// ── DB Row Types ──────────────────────────────────────────────────────────────
type CredRow = { key: string; value: string; is_encrypted: boolean };
type CfgRow  = { key: string; value: string };

// ── Adapter Factory ───────────────────────────────────────────────────────────
async function buildKiss918Adapter(): Promise<Kiss918Adapter | null> {
  console.log('[gaming:build] step 1 — createGamingPlatform()');
  // 1. Resolve the platform singleton (creates all core engines once)
  const platform = createGamingPlatform();
  console.log('[gaming:build] step 1 OK');

  // 2. Find the 918KISS provider record
  console.log('[gaming:build] step 2 — querying gp_providers WHERE code=\'918KISS\'');
  const { rows: provRows } = await pool.query<{ id: number; status: string }>(
    `SELECT id, status FROM gp_providers WHERE code = '918KISS' LIMIT 1`,
  );
  const prov = provRows[0];
  if (!prov) {
    console.warn('[gaming:build] step 2 FAIL — 918KISS not found in gp_providers.');
    return null;
  }
  console.log(`[gaming:build] step 2 OK — provider id=${prov.id} status=${prov.status}`);
  if (prov.status !== 'ACTIVE' && prov.status !== 'TESTING') {
    console.warn(`[gaming:build] step 2 FAIL — provider status="${prov.status}", expected ACTIVE or TESTING.`);
    return null;
  }

  // 3. Load and decrypt credentials
  console.log(`[gaming:build] step 3 — querying gp_credentials for provider_id=${prov.id}`);
  const { rows: credRows } = await pool.query<CredRow>(
    `SELECT key, value, is_encrypted FROM gp_credentials WHERE provider_id = $1`,
    [prov.id],
  );
  console.log(`[gaming:build] step 3 OK — ${credRows.length} credential rows`);
  const cred: Record<string, string> = {};
  for (const row of credRows) {
    cred[row.key] = row.is_encrypted ? decryptCredential(row.value) : row.value;
  }
  console.log(`[gaming:build] step 3 OK — ${credRows.length} credentials decrypted`);

  // 4. Load configuration
  console.log(`[gaming:build] step 4 — querying gp_config for provider_id=${prov.id}`);
  const { rows: cfgRows } = await pool.query<CfgRow>(
    `SELECT key, value FROM gp_config WHERE provider_id = $1`,
    [prov.id],
  );
  console.log(`[gaming:build] step 4 OK — ${cfgRows.length} config rows`);
  const cfg: Record<string, string> = {};
  for (const row of cfgRows) cfg[row.key] = row.value;

  // 5. Build typed objects
  console.log('[gaming:build] step 5 — building credentials/config objects');
  const credentials: Kiss918Credentials = {
    api_token:      cred['api_token']      ?? '',
    operator_token: cred['operator_token'] ?? '',
    md5_key:        cred['md5_key']        ?? '',
    secret_key:     cred['secret_key']     ?? '',
    encrypt_key:    cred['encrypt_key']    ?? '',
    delimiter:      cred['delimiter']      ?? '',
  };

  const config: Kiss918Config = {
    api_base_url:        cfg['api_base_url']        ?? '',
    datafeed_url:        cfg['datafeed_url']         ?? undefined,
    h5_api_domain:       cfg['h5_api_domain']        ?? '',
    h5_lobby_domain:     cfg['h5_lobby_domain']      ?? '',
    h5_game_domain:      cfg['h5_game_domain']       ?? '',
    game_icon_url:       cfg['game_icon_url']        ?? undefined,
    postfix_id:          cfg['postfix_id']            ?? '',
    currency:            cfg['currency']              ?? 'MYR',
    timeout_ms:          cfg['timeout_ms']
                           ? parseInt(cfg['timeout_ms'], 10) : 10_000,
    circuit_threshold:   cfg['circuit_threshold']
                           ? parseInt(cfg['circuit_threshold'], 10) : 5,
    circuit_cooldown_ms: cfg['circuit_cooldown_ms']
                           ? parseInt(cfg['circuit_cooldown_ms'], 10) : 30_000,
    debug:
      cfg['debug'] === 'true' ||
      process.env.ENABLE_PROVIDER_DEBUG === 'true',
  };
  console.log(`[gaming:build] step 5 OK — operator_token present=${!!credentials.operator_token} api_base_url=${config.api_base_url}`);

  // 6. Instantiate adapter
  console.log('[gaming:build] step 6 — new Kiss918Adapter(...)');
  const providerRepo = new ProviderRepository();
  const adapter = new Kiss918Adapter(
    credentials,
    config,
    platform.wallet,
    platform.eventLogger,
    providerRepo,
  );
  console.log('[gaming:build] step 6 OK — Kiss918Adapter ready');
  return adapter;
}

// ── Singleton Cache ───────────────────────────────────────────────────────────
// undefined = not yet attempted; null = provider not ACTIVE/TESTING or not found (intentional)
// Exceptions (transient errors) do NOT cache to null — they leave _kiss918 as
// undefined so the next request retries instead of being permanently broken.
let _kiss918: Kiss918Adapter | null | undefined = undefined;

export async function getKiss918Adapter(): Promise<Kiss918Adapter | null> {
  if (_kiss918 !== undefined) return _kiss918;
  try {
    _kiss918 = await buildKiss918Adapter();
  } catch (err) {
    // Log the full error so it appears in docker compose logs
    console.error('[gaming] Kiss918Adapter init EXCEPTION — not caching null, will retry on next request.');
    console.error('[gaming] Exception detail:', err instanceof Error ? err.stack : String(err));
    // _kiss918 stays undefined → next request retries buildKiss918Adapter()
    return null;
  }
  return _kiss918;
}

/** Force re-initialisation after credential/config changes (e.g. ERP settings page). */
export function resetGamingPlatform(): void {
  _kiss918 = undefined;
}
