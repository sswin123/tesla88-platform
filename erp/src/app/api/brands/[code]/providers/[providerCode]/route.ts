import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';
import { createGamingPlatform } from '@/lib/providers';

type Params = { params: Promise<{ code: string; providerCode: string }> };

function maskValue(val: string): string {
  if (!val) return '—';
  if (val.length <= 8) return '*'.repeat(val.length);
  return val.slice(0, 4) + '*'.repeat(val.length - 8) + val.slice(-4);
}

/** Resolve (brand_id, provider_id, brand_provider.id) from URL params. */
async function resolveBrandProvider(
  brandCode: string,
  providerCode: string,
): Promise<{ brandId: number; providerId: number; brandProviderId: number } | null> {
  const { rows } = await pool.query<{
    brand_id: number; provider_id: number; bp_id: number;
  }>(
    `SELECT b.id AS brand_id, p.id AS provider_id, bp.id AS bp_id
     FROM brands b
     JOIN brand_providers bp ON bp.brand_id = b.id
     JOIN gp_providers p     ON p.id = bp.provider_id
     WHERE b.code = $1 AND p.code = $2
     LIMIT 1`,
    [brandCode, providerCode],
  );
  if (!rows[0]) return null;
  return { brandId: rows[0].brand_id, providerId: rows[0].provider_id, brandProviderId: rows[0].bp_id };
}

/**
 * GET /api/brands/[code]/providers/[providerCode]
 * Returns brand-provider details, masked credentials, and config key-values.
 * Requires game.manage permission.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code, providerCode } = await params;
  const ids = await resolveBrandProvider(code.toUpperCase(), providerCode.toUpperCase());
  if (!ids) return NextResponse.json({ error: 'Brand provider not found' }, { status: 404 });

  const { rows: bpRows } = await pool.query<{
    id: number; status: string; wallet_type: string; environment: string;
    currency: string; health_status: string; health_checked_at: string | null;
    last_success_at: string | null; last_failed_at: string | null;
    created_at: string; updated_at: string;
    provider_code: string; provider_name: string; provider_display_name: string;
    brand_code: string; brand_name: string;
    gp_wallet_type: string;
  }>(
    `SELECT
       bp.id, bp.status, bp.wallet_type, bp.environment, bp.currency,
       bp.health_status, bp.health_checked_at, bp.last_success_at,
       bp.last_failed_at, bp.created_at, bp.updated_at,
       p.code AS provider_code, p.name AS provider_name,
       p.display_name AS provider_display_name,
       b.code AS brand_code, b.name AS brand_name,
       p.wallet_type AS gp_wallet_type
     FROM brand_providers bp
     JOIN gp_providers p ON p.id = bp.provider_id
     JOIN brands b        ON b.id = bp.brand_id
     WHERE bp.id = $1`,
    [ids.brandProviderId],
  );

  // Masked credentials (value never exposed in plain text)
  const { rows: credRows } = await pool.query<{
    key: string; is_encrypted: boolean; updated_at: string; updated_by_name: string | null;
    masked_value: string;
  }>(
    `SELECT
       key,
       is_encrypted,
       updated_at,
       updated_by_name,
       CASE
         WHEN LENGTH(value) <= 8 THEN REPEAT('*', LENGTH(value))
         ELSE SUBSTRING(value,1,4) || REPEAT('*', LENGTH(value)-8) || SUBSTRING(value, LENGTH(value)-3)
       END AS masked_value
     FROM brand_provider_credentials
     WHERE brand_provider_id = $1
     ORDER BY key ASC`,
    [ids.brandProviderId],
  );

  // Config (non-secret, returned as plain values)
  const { rows: cfgRows } = await pool.query<{
    key: string; value: string; updated_at: string; updated_by_name: string | null;
  }>(
    `SELECT key, value, updated_at, updated_by_name
     FROM brand_provider_config
     WHERE brand_provider_id = $1
     ORDER BY key ASC`,
    [ids.brandProviderId],
  );

  return NextResponse.json({
    brand_provider: bpRows[0],
    credentials: credRows,
    config: cfgRows,
  });
}

/**
 * PATCH /api/brands/[code]/providers/[providerCode]
 * Multi-mode update:
 *
 *   { type: 'settings', status?, wallet_type?, environment?, currency? }
 *     — update operational parameters
 *
 *   { type: 'credential', key, value, encrypt? }
 *     — upsert a credential key (requires game.credentials permission)
 *
 *   { type: 'config', key, value }
 *     — upsert a config key
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { code, providerCode } = await params;
  const upperBrand    = code.toUpperCase();
  const upperProvider = providerCode.toUpperCase();

  const body = await req.json().catch(() => ({})) as {
    type?: 'settings' | 'credential' | 'config';
    // settings fields
    status?: unknown;
    wallet_type?: unknown;
    environment?: unknown;
    currency?: unknown;
    // credential / config fields
    key?: unknown;
    value?: unknown;
    encrypt?: unknown;
  };

  // Credential ops require elevated permission
  const isCredOp = body.type === 'credential';
  const perm = isCredOp ? 'game.credentials' : 'game.manage';
  const payload = await requirePermission(perm);
  if (!payload) {
    return NextResponse.json(
      { error: isCredOp ? 'Credential management requires game.credentials permission' : 'Unauthorized' },
      { status: 401 },
    );
  }

  const ids = await resolveBrandProvider(upperBrand, upperProvider);
  if (!ids) return NextResponse.json({ error: 'Brand provider not found' }, { status: 404 });
  const { brandProviderId } = ids;
  const adminId = payload.sub;
  const adminUsername = payload.username;

  // ── Settings update ──────────────────────────────────────────────────────────
  if (body.type === 'settings') {
    const STATUSES     = ['ACTIVE', 'DISABLED', 'MAINTENANCE', 'TESTING'];
    const WALLET_TYPES = ['SEAMLESS', 'TRANSFER'];
    const ENVS         = ['PRODUCTION', 'SANDBOX'];

    const sets: string[] = [];
    const vals: unknown[] = [brandProviderId];
    let i = 2;

    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status as string)) {
        return NextResponse.json(
          { error: `Invalid status. Allowed: ${STATUSES.join(', ')}` },
          { status: 400 },
        );
      }
      sets.push(`status = $${i++}`);
      vals.push(body.status);
    }
    if (body.wallet_type !== undefined) {
      if (!WALLET_TYPES.includes(body.wallet_type as string)) {
        return NextResponse.json(
          { error: `Invalid wallet_type. Allowed: ${WALLET_TYPES.join(', ')}` },
          { status: 400 },
        );
      }
      sets.push(`wallet_type = $${i++}`);
      vals.push(body.wallet_type);
    }
    if (body.environment !== undefined) {
      if (!ENVS.includes(body.environment as string)) {
        return NextResponse.json(
          { error: `Invalid environment. Allowed: ${ENVS.join(', ')}` },
          { status: 400 },
        );
      }
      sets.push(`environment = $${i++}`);
      vals.push(body.environment);
    }
    if (typeof body.currency === 'string' && body.currency.trim()) {
      sets.push(`currency = $${i++}`);
      vals.push(body.currency.trim().toUpperCase().slice(0, 3));
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'No settings fields to update' }, { status: 400 });
    }

    sets.push('updated_at = NOW()');
    await pool.query(
      `UPDATE brand_providers SET ${sets.join(', ')} WHERE id = $1`,
      vals,
    );
    // Invalidate + eagerly rebuild snapshot (fire-and-forget, returns immediately)
    try { createGamingPlatform().brandManager.invalidateAndReload(upperBrand, upperProvider).catch(() => undefined); } catch { /* best-effort */ }
    return NextResponse.json({ ok: true });
  }

  // ── Credential upsert ────────────────────────────────────────────────────────
  if (body.type === 'credential') {
    const key   = typeof body.key   === 'string' ? body.key.trim()   : '';
    const value = typeof body.value === 'string' ? body.value        : '';
    if (!key)   return NextResponse.json({ error: 'key is required' },   { status: 400 });
    if (!value) return NextResponse.json({ error: 'value is required' }, { status: 400 });

    const isEncrypted = body.encrypt === true; // default false — callers must explicitly pass encrypt:true for pre-encrypted values

    await pool.query(
      `INSERT INTO brand_provider_credentials
         (brand_provider_id, key, value, is_encrypted, updated_by, updated_by_name, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (brand_provider_id, key) DO UPDATE
         SET value = EXCLUDED.value, is_encrypted = EXCLUDED.is_encrypted,
             updated_by = EXCLUDED.updated_by, updated_by_name = EXCLUDED.updated_by_name,
             updated_at = NOW()`,
      [brandProviderId, key, value, isEncrypted, adminId, adminUsername],
    );
    // Invalidate + eagerly rebuild snapshot (fire-and-forget)
    try { createGamingPlatform().brandManager.invalidateAndReload(upperBrand, upperProvider).catch(() => undefined); } catch { /* best-effort */ }
    return NextResponse.json({
      ok: true,
      hint: maskValue(value),
    });
  }

  // ── Config upsert ────────────────────────────────────────────────────────────
  if (body.type === 'config') {
    const key   = typeof body.key   === 'string' ? body.key.trim()   : '';
    const value = typeof body.value === 'string' ? body.value        : '';
    if (!key)   return NextResponse.json({ error: 'key is required' },   { status: 400 });
    if (value === undefined || value === null) {
      return NextResponse.json({ error: 'value is required' }, { status: 400 });
    }

    await pool.query(
      `INSERT INTO brand_provider_config
         (brand_provider_id, key, value, updated_by, updated_by_name, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (brand_provider_id, key) DO UPDATE
         SET value = EXCLUDED.value,
             updated_by = EXCLUDED.updated_by, updated_by_name = EXCLUDED.updated_by_name,
             updated_at = NOW()`,
      [brandProviderId, key, value, adminId, adminUsername],
    );
    // Invalidate + eagerly rebuild snapshot (fire-and-forget)
    try { createGamingPlatform().brandManager.invalidateAndReload(upperBrand, upperProvider).catch(() => undefined); } catch { /* best-effort */ }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { error: 'type must be "settings", "credential", or "config"' },
    { status: 400 },
  );
}

/**
 * DELETE /api/brands/[code]/providers/[providerCode]
 * Remove a provider from a brand.
 * Protected: rejected if the brand-provider status is ACTIVE.
 * Credentials and config are cascade-deleted via FK.
 * Requires game.manage permission.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code, providerCode } = await params;
  const ids = await resolveBrandProvider(code.toUpperCase(), providerCode.toUpperCase());
  if (!ids) return NextResponse.json({ error: 'Brand provider not found' }, { status: 404 });

  const { rows: statusRows } = await pool.query<{ status: string }>(
    `SELECT status FROM brand_providers WHERE id = $1`,
    [ids.brandProviderId],
  );
  if (statusRows[0]?.status === 'ACTIVE') {
    return NextResponse.json(
      { error: 'Cannot remove: provider is currently ACTIVE. Set status to DISABLED first.' },
      { status: 409 },
    );
  }

  // Cascade via FK: brand_provider_credentials and brand_provider_config deleted automatically
  await pool.query(`DELETE FROM brand_providers WHERE id = $1`, [ids.brandProviderId]);

  return NextResponse.json({ ok: true });
}
