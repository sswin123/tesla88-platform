import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

type Params = { params: Promise<{ code: string }> };

interface UrlCheckResult {
  label: string;
  url: string | null;
  ok: boolean;
  latency_ms: number | null;
  http_status?: number;
  error?: string;
}

async function checkUrl(label: string, url: string | null | undefined, timeoutMs = 5000): Promise<UrlCheckResult> {
  if (!url) return { label, url: null, ok: false, latency_ms: null, error: 'URL not configured' };
  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      // Don't follow redirects to avoid false positives
      redirect: 'manual',
    });
    clearTimeout(timer);
    const latency_ms = Date.now() - start;
    // HTTP 2xx/3xx = reachable; 4xx/5xx also mean reachable (server responded)
    const ok = res.status < 600;
    return { label, url, ok, latency_ms, http_status: res.status };
  } catch (err: unknown) {
    clearTimeout(timer);
    const latency_ms = Date.now() - start;
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      label, url, ok: false, latency_ms,
      error: isAbort ? `Timeout after ${timeoutMs}ms` : (err instanceof Error ? err.message : String(err)),
    };
  }
}

/**
 * POST /api/games/settings/[code]/test
 * Performs a connectivity and configuration check for a provider.
 * Checks: URL reachability for each configured endpoint + credential presence.
 * All checks are done server-side to avoid CORS/firewall issues from the browser.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;
  const upperCode = code.toUpperCase();

  const { rows: provRows } = await pool.query(
    `SELECT id, code, display_name, status, environment
     FROM gp_providers WHERE code = $1 LIMIT 1`,
    [upperCode],
  );
  if (!provRows[0]) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });

  const provider = provRows[0];

  // Load config
  const { rows: cfgRows } = await pool.query<{ key: string; value: string }>(
    `SELECT key, value FROM gp_config WHERE provider_id = $1`, [provider.id],
  );
  const cfg = Object.fromEntries(cfgRows.map(r => [r.key, r.value]));

  // Load credential presence (key name only, no values)
  const { rows: credRows } = await pool.query<{ key: string; value: string }>(
    `SELECT key, value FROM gp_credentials WHERE provider_id = $1`, [provider.id],
  );
  const creds = Object.fromEntries(credRows.map(r => [r.key, r.value]));

  // ── URL reachability checks ────────────────────────────────────────────────
  const startAll = Date.now();
  const urlChecks = await Promise.all([
    checkUrl('API Base URL',   cfg['api_base_url']),
    checkUrl('DataFeed URL',   cfg['datafeed_url']),
    checkUrl('H5 API URL',     cfg['h5_api_domain']),
    checkUrl('H5 Lobby URL',   cfg['h5_lobby_domain']),
  ]);
  const totalLatency = Date.now() - startAll;

  // ── Credential presence checks ────────────────────────────────────────────
  const credChecks = [
    { key: 'secret_key',     label: 'SecretKey' },
    { key: 'operator_token', label: 'Operator Token' },
    { key: 'api_token',      label: 'Access Token' },
    { key: 'md5_key',        label: 'Md5EncryptKey' },
    { key: 'encrypt_key',    label: 'EncryptKey' },
  ].map(({ key, label }) => ({
    label,
    loaded: !!(creds[key] && creds[key].trim().length > 0),
  }));

  // ── Config presence checks ────────────────────────────────────────────────
  const configChecks = [
    { key: 'api_base_url',   label: 'API Base URL' },
    { key: 'postfix_id',     label: 'PostFix ID' },
    { key: 'currency',       label: 'Currency' },
  ].map(({ key, label }) => ({
    label,
    loaded: !!(cfg[key] && cfg[key].trim().length > 0),
    value: key === 'postfix_id' ? cfg[key] : undefined,  // show postfix_id for verification
  }));

  const urlsPassed  = urlChecks.filter(c => c.ok).length;
  const urlsFailed  = urlChecks.filter(c => !c.ok).length;
  const credsPassed = credChecks.filter(c => c.loaded).length;
  const cfgPassed   = configChecks.filter(c => c.loaded).length;

  const overall =
    urlsFailed === 0 && credChecks.every(c => c.loaded) && configChecks.every(c => c.loaded)
      ? 'SUCCESS' : 'PARTIAL';

  // Record in audit log
  await pool.query(
    `INSERT INTO gp_config_audit_log
       (provider_id, provider_code, admin_id, admin_username, action, notes)
     VALUES ($1,$2,$3,$4,'CONNECTION_TEST',$5)`,
    [
      provider.id, upperCode, payload.sub, payload.username,
      `Result: ${overall} — URLs ${urlsPassed}/${urlChecks.length} OK`,
    ],
  );

  return NextResponse.json({
    overall,
    provider: { code: provider.code, display_name: provider.display_name, status: provider.status, environment: provider.environment },
    url_checks: urlChecks,
    credential_checks: credChecks,
    config_checks: configChecks,
    summary: {
      urls_ok:  urlsPassed,
      urls_fail: urlsFailed,
      creds_ok: credsPassed,
      creds_total: credChecks.length,
      config_ok: cfgPassed,
      config_total: configChecks.length,
    },
    total_latency_ms: totalLatency,
    tested_at: new Date().toISOString(),
  });
}
