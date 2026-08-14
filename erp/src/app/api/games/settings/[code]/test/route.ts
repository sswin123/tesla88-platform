import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';
import { Kiss918AuthService } from '@/lib/providers/adapters/kiss918/Kiss918AuthService';
import { createGamingPlatform, ProviderRepository } from '@/lib/providers';
import { ProviderRuntimeBuilder } from '@/lib/providers/core/ProviderRuntimeBuilder';
import { providerRegistry } from '@/lib/services/provider-registry';
import { resolveProvider } from '@/lib/games/resolve-provider';

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

// ── Pussy888 getUserInfo probe ────────────────────────────────────────────────
//
// Calls getUserInfo.ashx with a known-absent probe account ({agent}u0).
// A "user not found" API response means credentials are valid and API is reachable.
// Auth errors (sign mismatch / wrong authcode) mean the credentials are wrong.
//
// Three-state classification:
//   ok          — API returned isSuccess=true (probe user unexpectedly found)
//   configured  — API responded with JSON; user-not-found = credentials valid
//   error       — network failure OR auth failure (sign error / wrong authcode)
//
// Does NOT call setScore — read-only probe only.
import { createHash } from 'crypto';

function pussy888Sign(authcode: string, userName: string, time: string, secretKey: string): string {
  return createHash('md5')
    .update((authcode + userName + time + secretKey).toLowerCase(), 'utf8')
    .digest('hex');
}

async function testPussy888GetUserInfo(
  cfg:   Record<string, string>,
  creds: Record<string, string>,
): Promise<UrlCheckResult> {
  const label     = 'Pussy888 API (getUserInfo)';
  const baseUrl   = cfg['api_base_url']?.replace(/\/$/, '');
  const baseUrl2  = cfg['api_base_url2']?.replace(/\/$/, '');
  const authcode  = creds['authcode']   ?? '';
  const secretKey = creds['secret_key'] ?? '';
  const agent     = creds['agent']      ?? '';

  if (!baseUrl) {
    return { label, url: null, state: 'error', latency_ms: null, error: 'api_base_url 未配置' };
  }
  if (!authcode || !secretKey || !agent) {
    return { label, url: null, state: 'error', latency_ms: null, error: '凭证未配置 (agent / authcode / secret_key)' };
  }

  const probeUser = `${agent}u0`;
  const time      = String(Date.now());
  const sign      = pussy888Sign(authcode, probeUser, time, secretKey);
  const params    = new URLSearchParams({ authcode, userName: probeUser, time, sign });
  const endpoint  = 'getUserInfo.ashx';

  // Try primary, then fallback
  const urls = [baseUrl, ...(baseUrl2 ? [baseUrl2] : [])].map(b => `${b}/${endpoint}`);
  let finalUrl = urls[0];

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  const start = Date.now();

  let res: Response | null = null;
  let networkErr: string | null = null;

  for (const url of urls) {
    finalUrl = url;
    try {
      res = await fetch(`${url}?${params}`, { method: 'GET', signal: ctrl.signal });
      break; // success
    } catch (e) {
      networkErr = e instanceof Error ? e.message : String(e);
      res = null;
    }
  }
  clearTimeout(timer);
  const latency_ms = Date.now() - start;

  if (!res) {
    return {
      label, url: finalUrl, state: 'error', latency_ms,
      error: networkErr ?? 'Network failure',
    };
  }

  if (!res.ok) {
    return {
      label, url: finalUrl, state: 'error', latency_ms,
      http_status: res.status,
      error: `HTTP ${res.status}`,
    };
  }

  const body = await res.text().catch(() => '');
  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(body) as Record<string, unknown>; } catch { /* ignore */ }

  if (!parsed) {
    return {
      label, url: finalUrl, state: 'configured', latency_ms,
      note: `API 可达，但响应非 JSON（可能需要 IP 白名单）。响应前 200 字符: ${body.slice(0, 200)}`,
    };
  }

  const errCode = parsed['errCode'] as number | undefined;
  const msg     = String(parsed['msg'] ?? '');
  const isSuccess = !!parsed['isSuccess'];

  if (isSuccess) {
    return { label, url: finalUrl, state: 'ok', latency_ms, note: '凭证验证成功（探针用户存在）' };
  }

  // Distinguish auth errors from "user not found"
  const lmsg = msg.toLowerCase();
  const isAuthErr = lmsg.includes('sign') || lmsg.includes('auth') || lmsg.includes('authcode') ||
                    lmsg.includes('token') || lmsg.includes('forbidden') || errCode === 1001;

  if (isAuthErr) {
    return {
      label, url: finalUrl, state: 'error', latency_ms,
      error: `凭证验证失败 — errCode=${errCode} msg="${msg}"。检查 authcode / secret_key 是否正确。`,
    };
  }

  // Any other error (e.g. user not found) = API reachable, credentials valid
  return {
    label, url: finalUrl, state: 'configured', latency_ms,
    note: `API 连接正常。探针用户不存在（预期）— errCode=${errCode} msg="${msg}"。凭证有效。`,
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

  const { code: codeOrId } = await params;

  // ── Step 1: Validate provider exists ─────────────────────────────────────
  const resolvedProv = await resolveProvider(codeOrId);
  if (!resolvedProv) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  const upperCode = resolvedProv.code;

  const { rows: provRows } = await pool.query<{
    id: number; code: string; display_name: string; status: string; environment: string;
  }>(
    `SELECT id, code, display_name, status, environment
     FROM gp_providers WHERE id = $1`,
    [resolvedProv.id],
  );
  if (!provRows[0]) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  const provider = provRows[0];

  // ── Step 2: Find the brand_provider (most-ACTIVE for this provider) ──────
  const { rows: bpRows } = await pool.query<{ brand_code: string }>(
    `SELECT b.code AS brand_code
     FROM brand_providers bp
     JOIN brands b ON b.id = bp.brand_id
     WHERE bp.provider_id = $1
     ORDER BY (bp.status = 'ACTIVE') DESC, bp.id ASC
     LIMIT 1`,
    [provider.id],
  );

  // Provider not yet onboarded to brand framework — return PARTIAL with empty checks
  if (!bpRows[0]) {
    return NextResponse.json({
      overall: 'PARTIAL',
      provider: {
        code:         provider.code,
        display_name: provider.display_name,
        status:       provider.status,
        environment:  provider.environment,
      },
      url_checks:        [],
      credential_checks: [],
      config_checks:     [],
      summary: {
        urls_ok: 0, urls_configured: 0, urls_error: 0,
        creds_ok: 0, creds_total: 0, config_ok: 0, config_total: 0,
      },
      setup_note:      'Provider not yet configured in brand framework. Go to Brand Center to configure.',
      total_latency_ms: 0,
      tested_at:        new Date().toISOString(),
    });
  }

  const brandCode = bpRows[0].brand_code;

  // ── Step 3: Build runtime via ProviderRuntimeBuilder (Single Source of Truth) ──
  const platform     = createGamingPlatform();
  const providerRepo = new ProviderRepository();

  const result = await ProviderRuntimeBuilder.build(
    brandCode,
    upperCode,
    (v) => platform.security.decrypt(v),
    { wallet: platform.wallet, eventLogger: platform.eventLogger, providerRepo },
    false, // skip game count for speed
  );

  // ── Step 4: URL checks (dynamic — no hardcoded keys) ─────────────────────
  const providerMeta = await providerRegistry.getMetadata(upperCode);
  const startAll = Date.now();
  const urlChecks = await Promise.all([
    ...result.urlConfigKeys.map(k => {
      if (providerMeta.supports_lobby_auth_test === true && k === 'h5_lobby_domain') {
        return testKiss918H5LobbyFlow(result.config, result.credentials);
      }
      return checkUrl(k, result.config[k]);
    }),
    // PUSSY888APP: append a real getUserInfo API probe (read-only, no setScore)
    ...(upperCode === 'PUSSY888APP'
      ? [testPussy888GetUserInfo(result.config, result.credentials)]
      : []),
  ]);
  const totalLatency = Date.now() - startAll;

  // ── Step 5: Credential presence (dynamic from AdapterRegistry + DB keys) ─
  const allCredKeys = [...new Set([...result.requiredCredKeys, ...Object.keys(result.credentials)])];
  const credChecks  = allCredKeys.map(key => ({
    label:  key,
    loaded: !!(result.credentials[key]?.trim()),
  }));

  // ── Step 6: Config presence (non-URL keys only) ───────────────────────────
  const allCfgKeys  = [...new Set([...result.requiredConfigKeys, ...Object.keys(result.config)])];
  const configChecks = allCfgKeys
    .filter(k => !result.urlConfigKeys.includes(k))
    .map(key => ({
      label:  key,
      loaded: !!(result.config[key]?.trim()),
      value:  result.config[key] || undefined,
    }));

  // ── Step 7: Overall status ────────────────────────────────────────────────
  const urlErrors      = urlChecks.filter(c => c.state === 'error').length;
  const urlsOk         = urlChecks.filter(c => c.state === 'ok').length;
  const urlsConfigured = urlChecks.filter(c => c.state === 'configured').length;
  const credsPassed    = credChecks.filter(c => c.loaded).length;
  const cfgPassed      = configChecks.filter(c => c.loaded).length;

  const overall: 'SUCCESS' | 'PARTIAL' =
    urlErrors === 0 && credChecks.every(c => c.loaded) && configChecks.every(c => c.loaded)
      ? 'SUCCESS' : 'PARTIAL';

  // ── Step 8: Audit log (Global Provider audit — connection test is provider-level) ─
  await pool.query(
    `INSERT INTO gp_config_audit_log
       (provider_id, provider_code, admin_id, admin_username, action, notes)
     VALUES ($1, $2, $3, $4, 'CONNECTION_TEST', $5)`,
    [
      provider.id, upperCode, payload.sub, payload.username,
      `Result: ${overall} — brand=${brandCode} URLs ok=${urlsOk} configured=${urlsConfigured} error=${urlErrors}`,
    ],
  );

  // ── Step 9: Response (format unchanged — Gaming Platform UI needs no changes) ─
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
