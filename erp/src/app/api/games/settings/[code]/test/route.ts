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
  label:        string;
  url:          string | null;
  state:        UrlState;
  latency_ms:   number | null;
  http_status?: number;
  error?:       string;
  note?:        string;   // human-readable explanation for non-ok states
  raw_http?:    RawHttpDiagnostics;
}

export interface RawHttpDiagnostics {
  request_url:      string;
  request_method:   string;
  request_headers:  Record<string, string>;
  request_body:     string;
  response_status:  number;
  response_headers: Record<string, string>;
  response_body:    string;        // first 4000 chars
  response_body_len: number;
  response_format:  string;        // 'JSON' | 'HTML' | 'XML' | 'EMPTY' | 'BINARY' | 'UNKNOWN'
  parsed_body:      unknown;       // result of JSON.parse, or null
  parse_error:      string | null;
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
// Mirrors the Kiss918AuthService.getLoginToken() format (API v1.11 page 45-48):
//   QS = key=…{d}time=…{d}userName=…{d}password=…{d}currency=…{d}nickName=…
//   q  = URLEncode(DES-CBC-encrypt(QS, encryptKey))
//   s  = MD5(QS + md5Key + currTime + secretKey)  — lowercase
//   POST body JSON: { q, s, accessToken }
//
// Uses probe account u0@{postfix_id} — 918KISS will return player-not-found (expected).
// "ok"         = actk received, full Lobby URL generated.
// "configured" = H5 API reachable and replied (any non-network failure).
// "error"      = network / timeout / DNS failure.
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

  const md5Key      = decryptedCreds['md5_key'];
  const secretKey   = decryptedCreds['secret_key'];
  const encryptKey  = decryptedCreds['encrypt_key'];
  const delimiter   = decryptedCreds['delimiter'] ?? '';
  const accessToken = decryptedCreds['api_token'] ?? '';

  if (!md5Key || !secretKey || !encryptKey) {
    return { label, url: null, state: 'error', latency_ms: null, error: 'H5 凭证未配置 (md5_key / secret_key / encrypt_key)' };
  }

  const probeAccount = `u0@${postfixId}`;

  // Format currTime as yyyyMMddHHmmss UTC (API v1.11 requirement)
  const now = new Date();
  const p   = (n: number) => String(n).padStart(2, '0');
  const currTime = String(now.getUTCFullYear()) + p(now.getUTCMonth() + 1) + p(now.getUTCDate()) +
    p(now.getUTCHours()) + p(now.getUTCMinutes()) + p(now.getUTCSeconds());

  // Build request using Kiss918AuthService (same logic as getLoginToken)
  const svc = new Kiss918AuthService();
  const d   = delimiter;
  const QS  = [
    `key=${secretKey}`,
    `time=${currTime}`,
    `userName=${probeAccount}`,
    `password=${probeAccount}`,
    `currency=${currency}`,
    `nickName=${probeAccount}`,
  ].join(d);

  const q        = encodeURIComponent(svc.desEncrypt(QS, encryptKey));
  const s        = svc.md5Hex(QS + md5Key + currTime + secretKey);
  const jsonBody = JSON.stringify({ q, s, accessToken });
  const reqUrl   = `${h5ApiDomain}/api/Acc/Login`;
  const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json' };

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  const start = Date.now();

  let res: Response;
  try {
    res = await fetch(reqUrl, {
      method:  'POST',
      headers: reqHeaders,
      body:    jsonBody,
      signal:  ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const latency_ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return { label, url: `${h5LobbyDomain}/apiLobby?tkn=…`, state: 'error', latency_ms, error: msg };
  }
  clearTimeout(timer);
  const latency_ms = Date.now() - start;

  // Capture raw response ─────────────────────────────────────────────────────
  const resStatus  = res.status;
  const resHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => { resHeaders[k] = v; });
  const rawBody = await res.text();

  let parsedBody: unknown = null;
  let parseError: string | null = null;
  try { parsedBody = JSON.parse(rawBody); } catch (e) { parseError = String(e); }

  const bodyTrimmed = rawBody.trimStart();
  const responseFormat =
    rawBody.length === 0                          ? 'EMPTY'
    : bodyTrimmed.startsWith('<')                 ? (bodyTrimmed.startsWith('<!') ? 'HTML' : 'XML')
    : (parsedBody !== null && parseError === null)? 'JSON'
    : /^[\x00-\x08\x0e-\x1f]/.test(rawBody)     ? 'BINARY'
    : 'UNKNOWN';

  const diag: RawHttpDiagnostics = {
    request_url:       reqUrl,
    request_method:    'POST',
    request_headers:   reqHeaders,
    request_body:      JSON.stringify({ q: q.slice(0, 20) + '…', s, accessToken: accessToken.slice(0, 8) + '…' }),
    response_status:   resStatus,
    response_headers:  resHeaders,
    response_body:     rawBody.slice(0, 4000),
    response_body_len: rawBody.length,
    response_format:   responseFormat,
    parsed_body:       parsedBody,
    parse_error:       parseError,
  };

  // Classify result ──────────────────────────────────────────────────────────
  if (parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)) {
    const d = parsedBody as Record<string, unknown>;
    const actk       = d['actk']       as string | undefined;
    const statusCode = d['statusCode'] as number | undefined;

    if (actk && statusCode === 0) {
      return {
        label,
        url:        `${h5LobbyDomain}/apiLobby?tkn=${actk}&language=2&lobbyUrl=`,
        state:      'ok',
        latency_ms,
        note:       'H5 认证成功，Lobby URL 已生成（含实时 Token）。',
        raw_http:   diag,
      };
    }

    // API replied with JSON but token not granted (expected for probe account)
    return {
      label,
      url:        `${h5LobbyDomain}/apiLobby?tkn=…`,
      state:      'configured',
      latency_ms,
      http_status: resStatus,
      note:       `H5 API 可达。响应格式: ${responseFormat}。parsed_body 见 raw_http。`,
      raw_http:   diag,
    };
  }

  // Non-JSON or empty response
  return {
    label,
    url:        `${h5LobbyDomain}/apiLobby?tkn=…`,
    state:      resStatus >= 200 && resStatus < 300 ? 'configured' : 'error',
    latency_ms,
    http_status: resStatus,
    note:       `响应格式: ${responseFormat}（非 JSON）。完整内容见 raw_http。`,
    raw_http:   diag,
  };
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
