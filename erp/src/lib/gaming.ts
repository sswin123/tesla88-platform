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
  // 1. Resolve the platform singleton (creates all core engines once)
  const platform = createGamingPlatform();

  // 2. Find the 918KISS provider record
  const { rows: provRows } = await pool.query<{ id: number; status: string }>(
    `SELECT id, status FROM gp_providers WHERE code = '918KISS' LIMIT 1`,
  );
  const prov = provRows[0];
  if (!prov) {
    console.warn('[gaming] 918KISS provider not found in gp_providers.');
    return null;
  }
  if (prov.status !== 'ACTIVE') {
    console.warn(`[gaming] 918KISS provider status is "${prov.status}" — not ACTIVE.`);
    return null;
  }

  // 3. Load and decrypt credentials
  const { rows: credRows } = await pool.query<CredRow>(
    `SELECT key, value, is_encrypted FROM gp_credentials WHERE provider_id = $1`,
    [prov.id],
  );
  const cred: Record<string, string> = {};
  for (const row of credRows) {
    cred[row.key] = row.is_encrypted ? decryptCredential(row.value) : row.value;
  }

  // 4. Load configuration
  const { rows: cfgRows } = await pool.query<CfgRow>(
    `SELECT key, value FROM gp_config WHERE provider_id = $1`,
    [prov.id],
  );
  const cfg: Record<string, string> = {};
  for (const row of cfgRows) cfg[row.key] = row.value;

  // 5. Build typed objects
  const credentials: Kiss918Credentials = {
    api_token:      cred['api_token']      ?? '',
    operator_token: cred['operator_token'] ?? '',
    md5_key:        cred['md5_key']        ?? '',
    secret_key:     cred['secret_key']     ?? '',
    encrypt_key:    cred['encrypt_key']    ?? '',
    delimiter:      cred['delimiter']      ?? '',
  };

  const config: Kiss918Config = {
    api_base_url:       cfg['api_base_url']       ?? '',
    h5_api_domain:      cfg['h5_api_domain']       ?? '',
    h5_lobby_domain:    cfg['h5_lobby_domain']     ?? '',
    h5_game_domain:     cfg['h5_game_domain']      ?? '',
    postfix_id:         cfg['postfix_id']           ?? '',
    currency:           cfg['currency']             ?? 'MYR',
    timeout_ms:         cfg['timeout_ms']
                          ? parseInt(cfg['timeout_ms'], 10) : 10_000,
    circuit_threshold:  cfg['circuit_threshold']
                          ? parseInt(cfg['circuit_threshold'], 10) : 5,
    circuit_cooldown_ms: cfg['circuit_cooldown_ms']
                          ? parseInt(cfg['circuit_cooldown_ms'], 10) : 30_000,
    debug:
      cfg['debug'] === 'true' ||
      process.env.ENABLE_PROVIDER_DEBUG === 'true',
  };

  // 6. Instantiate adapter
  const providerRepo = new ProviderRepository();
  return new Kiss918Adapter(
    credentials,
    config,
    platform.wallet,
    platform.eventLogger,
    providerRepo,
  );
}

// ── Singleton Cache ───────────────────────────────────────────────────────────
// undefined = not yet initialised; null = attempted but provider not ACTIVE/found
let _kiss918: Kiss918Adapter | null | undefined = undefined;

export async function getKiss918Adapter(): Promise<Kiss918Adapter | null> {
  if (_kiss918 !== undefined) return _kiss918;
  try {
    _kiss918 = await buildKiss918Adapter();
  } catch (err) {
    console.error('[gaming] Kiss918Adapter init failed:', err);
    _kiss918 = null;
  }
  return _kiss918;
}

/** Force re-initialisation after credential/config changes (e.g. ERP settings page). */
export function resetGamingPlatform(): void {
  _kiss918 = undefined;
}
