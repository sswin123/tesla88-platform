import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

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

// Per-URL-type notes for common non-2xx responses
const URL_NOTES: Record<string, string> = {
  'H5 Lobby URL': 'Requires a valid session token (/apiLobby?tkn=…) — cannot health-check directly',
  'H5 Game URL':  'Requires a valid session token — cannot health-check directly',
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

  const { rows: credRows } = await pool.query<{ key: string; value: string }>(
    `SELECT key, value FROM gp_credentials WHERE provider_id = $1`, [provider.id],
  );
  const creds = Object.fromEntries(credRows.map(r => [r.key, r.value]));

  // ── URL checks ────────────────────────────────────────────────────────────
  const startAll = Date.now();
  const urlChecks = await Promise.all([
    checkUrl('API Base URL', cfg['api_base_url']),
    checkUrl('DataFeed URL', cfg['datafeed_url']),
    checkUrl('H5 API URL',   cfg['h5_api_domain']),
    checkUrl('H5 Lobby URL', cfg['h5_lobby_domain']),
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
