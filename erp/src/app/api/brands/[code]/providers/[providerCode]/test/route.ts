/**
 * POST /api/brands/[code]/providers/[providerCode]/test
 *
 * Connection Test — Enterprise Provider SDK v2
 *
 * ALWAYS reads fresh from the database via ProviderRuntimeBuilder.
 * NEVER touches BrandManager cache / Snapshot cache / Adapter cache.
 *
 * Steps:
 *   1. ProviderRuntimeBuilder.build() — DB read + decrypt + adapter build
 *   2. URL reachability checks (real HTTP from server to provider)
 *   3. adapter.healthCheck() — real provider API call
 *   4. Write result to brand_providers.health_status + timestamps
 *   5. Invalidate + rebuild snapshot (background, non-blocking)
 *   6. Record metrics + event log
 *   7. Return comprehensive result with debug info
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';
import { createGamingPlatform, ProviderRepository } from '@/lib/providers';
import type { HealthCheckResult } from '@/lib/providers';
import { ProviderRuntimeBuilder } from '@/lib/providers/core/ProviderRuntimeBuilder';
import { RuntimeMetricsStore } from '@/lib/providers/core/RuntimeMetricsStore';
import { RuntimeEventStore } from '@/lib/providers/core/RuntimeEventStore';

type Params = { params: Promise<{ code: string; providerCode: string }> };

// ── URL probe ─────────────────────────────────────────────────────────────────

type UrlState = 'ok' | 'configured' | 'error' | 'not_configured';

interface UrlCheck {
  key:         string;
  label:       string;
  url:         string | null;
  state:       UrlState;
  latency_ms:  number | null;
  http_status?: number;
  error?:      string;
}

async function probeUrl(key: string, url: string | undefined): Promise<UrlCheck> {
  const label = key;
  if (!url?.trim()) {
    return { key, label, url: null, state: 'not_configured', latency_ms: null };
  }
  const t0 = Date.now();
  try {
    const ctrl    = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);
    const res     = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      redirect: 'follow',
    }).finally(() => clearTimeout(timeout));
    const latency_ms = Date.now() - t0;
    const state: UrlState = res.status < 500 ? 'ok' : 'configured';
    return { key, label, url, state, latency_ms, http_status: res.status };
  } catch (err) {
    return {
      key, label, url,
      state: 'error',
      latency_ms: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code, providerCode } = await params;
  const brand    = code.toUpperCase();
  const provider = providerCode.toUpperCase();
  const testStart = Date.now();

  // ── Phase 1: Build from DB (fresh, no cache) ──────────────────────────────
  const platform = createGamingPlatform();
  const providerRepo = new ProviderRepository();

  const result = await ProviderRuntimeBuilder.build(
    brand,
    provider,
    (v) => platform.security.decrypt(v),
    {
      wallet:       platform.wallet,
      eventLogger:  platform.eventLogger,
      providerRepo,
    },
    false, // skip game count for speed during Connection Test
  );

  if (!result.found) {
    return NextResponse.json({
      error:    'Brand provider not found',
      brand,
      provider,
      debug: {
        message:      result.adapterError,
        diagnostics:  result.diagnostics,
      },
    }, { status: 404 });
  }

  // ── Phase 2: URL reachability checks ─────────────────────────────────────
  // Use URL-type config keys discovered by ProviderRuntimeBuilder (not hardcoded)
  const urlChecks: UrlCheck[] = await Promise.all(
    result.urlConfigKeys.map(k => probeUrl(k, result.config[k])),
  );
  // If no URL keys found in config, report that explicitly
  const urlCheckSummary = result.urlConfigKeys.length === 0
    ? { note: `No URL-type config keys found. Required config: [${result.requiredConfigKeys.join(', ')}]` }
    : undefined;

  // ── Phase 3: Credential presence check ───────────────────────────────────
  // Show ALL credential keys from DB + flag missing required keys
  const allCredKeys = [...new Set([
    ...Object.keys(result.credentials),
    ...result.requiredCredKeys,
  ])];
  const credChecks = allCredKeys.map(key => ({
    key,
    loaded:   !!(result.credentials[key]?.trim()),
    required: result.requiredCredKeys.includes(key),
    status:   result.credentials[key]?.trim()
      ? 'present'
      : result.requiredCredKeys.includes(key) ? 'missing_required' : 'missing_optional',
  }));

  // ── Phase 4: Real provider health check ───────────────────────────────────
  let healthResult: HealthCheckResult | null = null;

  if (result.adapterBuilt && result.adapter) {
    try {
      healthResult = await result.adapter.healthCheck();
    } catch (err) {
      healthResult = {
        provider:      provider,
        status:        'DOWN',
        latency_ms:    null,
        error_message: err instanceof Error ? err.message : String(err),
        checked_at:    new Date().toISOString(),
      };
    }
  }

  // ── Phase 5: Determine overall status ─────────────────────────────────────
  const urlErrors    = urlChecks.filter(c => c.state === 'error').length;
  const credsMissing = result.missingCredKeys.length;
  const healthStatus = healthResult?.status ?? 'DOWN';

  const overall: 'HEALTHY' | 'DEGRADED' | 'DOWN' =
    result.adapterBuilt && healthStatus === 'HEALTHY' && urlErrors === 0
      ? 'HEALTHY'
      : result.adapterBuilt && urlErrors === 0 && credsMissing === 0
      ? 'DEGRADED'
      : 'DOWN';

  // ── Phase 6: Persist to DB ────────────────────────────────────────────────
  if (overall === 'HEALTHY') {
    await pool.query(
      `UPDATE brand_providers
       SET health_status = 'HEALTHY', health_checked_at = NOW(), last_success_at = NOW()
       WHERE id = $1`,
      [result.bpId],
    );
  } else {
    await pool.query(
      `UPDATE brand_providers
       SET health_status = $1, health_checked_at = NOW(), last_failed_at = NOW()
       WHERE id = $2`,
      [overall, result.bpId],
    );
  }

  // ── Phase 7: Metrics + event log ─────────────────────────────────────────
  const totalLatency = Date.now() - testStart;
  RuntimeMetricsStore.recordConnectionTest(brand, provider, overall === 'HEALTHY', totalLatency);
  RuntimeMetricsStore.updateHealth(brand, provider, overall);
  RuntimeEventStore.append(
    brand, provider, 'CONNECTION_TEST',
    overall === 'HEALTHY' ? 'SUCCESS' : 'FAILED',
    `Connection Test: ${overall}`,
    result.adapterError ?? healthResult?.error_message ?? null,
    totalLatency,
  );

  // ── Phase 8: Rebuild snapshot (non-blocking background) ──────────────────
  try {
    createGamingPlatform().brandManager.invalidateAndReload(brand, provider)
      .catch(() => undefined);
  } catch { /* best-effort */ }

  // ── Return ────────────────────────────────────────────────────────────────
  return NextResponse.json({
    overall,

    // DB read result (debug visibility)
    debug: {
      brand,
      provider,
      bpId:              result.bpId,
      config_key_count:  result.configCount,
      config_keys:       Object.keys(result.config),
      cred_key_count:    result.credCount,
      cred_keys:         Object.keys(result.credentials),
      decrypt_errors:    result.decryptErrors,
      adapter_registered: result.adapterRegistered,
      adapter_built:     result.adapterBuilt,
      adapter_error:     result.adapterError,
      adapter_version:   result.adapterVersion,
      missing_config:    result.missingConfigKeys,
      missing_creds:     result.missingCredKeys,
      diagnostics:       result.diagnostics,
    },

    // URL checks
    url_checks: urlChecks,
    ...(urlCheckSummary ? { url_check_note: urlCheckSummary.note } : {}),

    // Credential checks
    credential_checks: credChecks,

    // Health result from provider API
    health: healthResult,

    // Summary counters
    summary: {
      urls_checked:         urlChecks.length,
      urls_ok:              urlChecks.filter(c => c.state === 'ok').length,
      urls_error:           urlErrors,
      creds_present:        credChecks.filter(c => c.loaded).length,
      creds_required_total: result.requiredCredKeys.length,
      creds_missing:        credsMissing,
      adapter_built:        result.adapterBuilt,
      health_status:        healthStatus,
      test_duration_ms:     totalLatency,
    },

    tested_at: new Date().toISOString(),
  });
}
