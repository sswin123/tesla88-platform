import { createDecipheriv } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';
import { Kiss918AuthService } from '@/lib/providers/adapters/kiss918/Kiss918AuthService';

type Params = { params: Promise<{ code: string }> };

/**
 * Three-state URL check result:
 *   ok         — server responded with HTTP 2xx (fully reachable)
 *   configured — server responded with non-2xx (server is up, but URL requires auth/params)
 *   error      — no response at all (DNS failure, timeout, connection refused)
 */
export type UrlState = 'ok' | 'configured' | 'error';

export interface UrlCheckResult {
  label:       string;
  url:         string | null;
  state:       UrlState;
  latency_ms:  number | null;
  http_status?: number;
  error?:      string;
  note?:       string;   // human-readable explanation for non-ok states
}

// ── AES-256-GCM credential decryption (mirrors gaming.ts) ────────────────────
function decryptCredential(encrypted: string): string {
  const hexKey = process.env.AES_ENCRYPTION_KEY;
  if (!hexKey || hexKey.length !== 64) throw new Error('AES_ENCRYPTION_KEY not configured');
  const key    = Buffer.from(hexKey, 'hex');
  const buf    = Buffer.from(encrypted, 'base64');
  const iv      = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const cipher  = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(cipher).toString('utf8') + decipher.final('utf8');
}

function safeDecrypt(value: string, isEncrypted: boolean): string {
  if (!isEncrypted) return value;
  try { return decryptCredential(value); } catch { return ''; }
}

// ── 918KISS H5 Lobby real launch flow test ────────────────────────────────────
// Tests the actual Authenticate → Token → apiLobby?tkn=TOKEN flow.
// Uses probe account u0@{postfix_id} — 918KISS will return player-not-found (expected).
// "configured" state = H5 API reachable, credentials signed correctly.
// "ok" state        = Full token received, complete lobby URL generated.
// "error" state     = H5 API unreachable or credentials rejected.
async function testKiss918H5LobbyFlow(
  cfg: Record<string, string>,
  decryptedCreds: Record<string, string>,
): Promise<UrlCheckResult> {
  const label         = 'H5 Lobby (Auth→Token→apiLobby)';
  const h5ApiDomain   = cfg['h5_api_domain']?.replace(/\/$/, '');
  const h5LobbyDomain = cfg['h5_lobby_domain']?.replace(/\/$/, '');
  const postfixId     = cfg['postfix_id'] ?? 'probe';
  const currency      = cfg['currency'] ?? 'MYR';

  if (!h5ApiDomain || !h5LobbyDomain) {
    return { label, url: null, state: 'error', latency_ms: null, error: 'h5_api_domain 或 h5_lobby_domain 未配置' };
  }

  const md5Key     = decryptedCreds['md5_key'];
  const secretKey  = decryptedCreds['secret_key'];
  const encryptKey = decryptedCreds['encrypt_key'];
  const delimiter  = decryptedCreds['delimiter'] ?? '';

  if (!md5Key || !secretKey || !encryptKey) {
    return { label, url: null, state: 'error', latency_ms: null, error: 'H5 凭证未配置 (md5_key / secret_key / encrypt_key)' };
  }

  const probeAccount = `u0@${postfixId}`;
  const authService  = new Kiss918AuthService();
  const start        = Date.now();

  try {
    const { actk, latencyMs } = await authService.getLoginToken({
      accountId:   probeAccount,
      currency,
      nickname:    probeAccount,
      language:    2,
      lobbyUrl:    '',
      h5ApiDomain,
      md5Key,
      secretKey,
      encryptKey,
      delimiter,
      timeoutMs:   8000,
      debug:       false,
    });

    const lobbyUrl = `${h5LobbyDomain}/apiLobby?tkn=${actk}&language=2&lobbyUrl=`;
    return {
      label,
      url:        lobbyUrl,
      state:      'ok',
      latency_ms: latencyMs,
      note:       'H5 认证成功，Lobby URL 已生成（含实时 Token）。',
    };
  } catch (err) {
    const latency_ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);

    // statusCode= in message = 918KISS API responded (reachable + credentials signed OK)
    if (msg.includes('statusCode=')) {
      return {
        label,
        url:        `${h5LobbyDomain}/apiLobby?tkn=…`,
        state:      'configured',
        latency_ms,
        note:       `H5 API 可达，凭证签名成功。探测账号 "${probeAccount}" 返回: ${msg.replace('918KISS H5 Login failed: ', '')}`,
      };
    }

    return {
      label,
      url:        `${h5LobbyDomain}/apiLobby?tkn=…`,
      state:      'error',
      latency_ms,
      error:      msg,
    };
  }
}

// Per-URL-type notes for common non-2xx responses
const URL_NOTES: Record<string, string> = {
  'H5 Game URL': 'Requires a valid session token — cannot health-check directly',
};

async function checkUrl(
  label: string,
  url: string | null | undefined,
  timeoutMs = 6000,
): Promise<UrlCheckResult> {
  if (!url) {
    return { label, url: null, state: 'error', latency_ms: null, error: 'URL not configured' };
  }

  const start = Date.now();
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      redirect: 'manual',   // treat 3xx as a response, not a transparent follow
    });
    clearTimeout(timer);
    const latency_ms  = Date.now() - start;
    const http_status = res.status;

    // 2xx → ok (server is fully reachable at this URL)
    // anything else → configured (server responded but URL requires auth / different path)
    const state: UrlState = http_status >= 200 && http_status < 300 ? 'ok' : 'configured';
    const note = state === 'configured' ? (URL_NOTES[label] ?? `Server responded HTTP ${http_status} (may require auth or different path)`) : undefined;

    return { label, url, state, latency_ms, http_status, note };
  } catch (err: unknown) {
    clearTimeout(timer);
    const latency_ms = Date.now() - start;
    const isAbort    = err instanceof Error && err.name === 'AbortError';
    return {
      label, url, state: 'error', latency_ms,
      error: isAbort
        ? `Timeout after ${timeoutMs}ms — server unreachable or blocked`
        : (err instanceof Error ? err.message : String(err)),
    };
  }
}

/**
 * POST /api/games/settings/[code]/test
 *
 * Server-side connectivity + configuration check.
 * Uses three-state URL results: ok / configured / error.
 * "configured" = server is up but can't be health-checked without session/auth.
 * "error"      = server is unreachable (DNS failure, timeout, connection refused).
 *
 * Overall result:
 *   SUCCESS — no URL errors, all credentials loaded, all required config present
 *   PARTIAL — at least one URL in error state, or missing credentials / config
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code }    = await params;
  const upperCode   = code.toUpperCase();

  const { rows: provRows } = await pool.query(
    `SELECT id, code, display_name, status, environment
     FROM gp_providers WHERE code = $1 LIMIT 1`,
    [upperCode],
  );
  if (!provRows[0]) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  const provider = provRows[0];

  const { rows: cfgRows }  = await pool.query<{ key: string; value: string }>(
    `SELECT key, value FROM gp_config WHERE provider_id = $1`, [provider.id],
  );
  const cfg = Object.fromEntries(cfgRows.map(r => [r.key, r.value]));

  const { rows: credRows } = await pool.query<{
    key: string; value: string; is_encrypted: boolean;
  }>(
    `SELECT key, value, is_encrypted FROM gp_credentials WHERE provider_id = $1`, [provider.id],
  );
  const creds          = Object.fromEntries(credRows.map(r => [r.key, r.value]));
  const decryptedCreds = Object.fromEntries(
    credRows.map(r => [r.key, safeDecrypt(r.value, r.is_encrypted)]),
  );

  // ── URL checks ────────────────────────────────────────────────────────────
  const startAll = Date.now();
  const urlChecks = await Promise.all([
    checkUrl('API Base URL', cfg['api_base_url']),
    checkUrl('DataFeed URL', cfg['datafeed_url']),
    checkUrl('H5 API URL',   cfg['h5_api_domain']),
    // 918KISS H5 Lobby cannot be health-checked by GET to root domain.
    // Test the real Authenticate → Token → apiLobby?tkn flow instead.
    upperCode === '918KISS'
      ? testKiss918H5LobbyFlow(cfg, decryptedCreds)
      : checkUrl('H5 Lobby URL', cfg['h5_lobby_domain']),
  ]);
  const totalLatency = Date.now() - startAll;

  // ── Credential presence ───────────────────────────────────────────────────
  const credChecks = [
    { key: 'secret_key',     label: 'SecretKey' },
    { key: 'operator_token', label: 'Operator Token' },
    { key: 'api_token',      label: 'Access Token' },
    { key: 'md5_key',        label: 'Md5EncryptKey' },
    { key: 'encrypt_key',    label: 'EncryptKey' },
  ].map(({ key, label }) => ({
    label,
    loaded: !!(creds[key]?.trim()),
  }));

  // ── Config presence ───────────────────────────────────────────────────────
  const configChecks = [
    { key: 'api_base_url', label: 'API Base URL' },
    { key: 'postfix_id',   label: 'PostFix ID' },
    { key: 'currency',     label: 'Currency' },
  ].map(({ key, label }) => ({
    label,
    loaded: !!(cfg[key]?.trim()),
    value:  key === 'postfix_id' ? cfg[key] : undefined,
  }));

  // Only 'error' state counts as a failure for the overall result
  const urlErrors    = urlChecks.filter(c => c.state === 'error').length;
  const urlsOk       = urlChecks.filter(c => c.state === 'ok').length;
  const urlsConfigured = urlChecks.filter(c => c.state === 'configured').length;
  const credsPassed  = credChecks.filter(c => c.loaded).length;
  const cfgPassed    = configChecks.filter(c => c.loaded).length;

  const overall: 'SUCCESS' | 'PARTIAL' =
    urlErrors === 0 && credChecks.every(c => c.loaded) && configChecks.every(c => c.loaded)
      ? 'SUCCESS' : 'PARTIAL';

  await pool.query(
    `INSERT INTO gp_config_audit_log
       (provider_id, provider_code, admin_id, admin_username, action, notes)
     VALUES ($1,$2,$3,$4,'CONNECTION_TEST',$5)`,
    [
      provider.id, upperCode, payload.sub, payload.username,
      `Result: ${overall} — URLs ok=${urlsOk} configured=${urlsConfigured} error=${urlErrors}`,
    ],
  );

  return NextResponse.json({
    overall,
    provider: {
      code:         provider.code,
      display_name: provider.display_name,
      status:       provider.status,
      environment:  provider.environment,
    },
    url_checks:        urlChecks,
    credential_checks: credChecks,
    config_checks:     configChecks,
    summary: {
      urls_ok:         urlsOk,
      urls_configured: urlsConfigured,
      urls_error:      urlErrors,
      creds_ok:        credsPassed,
      creds_total:     credChecks.length,
      config_ok:       cfgPassed,
      config_total:    configChecks.length,
    },
    total_latency_ms: totalLatency,
    tested_at:        new Date().toISOString(),
  });
}
